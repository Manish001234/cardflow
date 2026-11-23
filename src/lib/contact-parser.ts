/** Deterministic contact parsing. Nothing in this module needs an AI service. */
export interface OCRLine { text: string; score: number; top?: number; left?: number }
export interface ParsedContact {
  fullName: string; jobTitle: string; companyName: string; email: string; phone: string;
  website: string; address: string; notes: string; confidenceScore: 'High' | 'Medium' | 'Low';
}
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WEB = /(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|co|in|io|ai|edu|gov|biz|dev|info)(?:\/[\w/?#=&%+.-]*)?/gi;
const JOB = /\b(?:founder|co-founder|director|manager|engineer|designer|developer|consultant|analyst|president|vice president|ceo|cto|cfo|coo|head|lead|sales|marketing|executive|officer|architect|specialist|proprietor|partner|accountant|recruiter|administrator|coordinator|doctor|professor|attorney|advocate|supervisor|representative|business development|operations|hr|human resources|general manager)\b/i;
const COMPANY = /\b(?:pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|llp|inc\.?|corp(?:oration)?|technologies|technology|solutions|systems|services|industries|enterprises|group|consulting|studio|labs|agency|company|software|traders|associates)\b/i;
const ADDRESS = /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|block|floor|building|tower|suite|office|sector|plot|near|opposite|industrial area|nagar|colony|district|city|state|pin(?:code)?|zip)\b/i;
const NOISE = /^(?:tel|mobile|mob|phone|email|e-mail|website|web|www|address|contact|fax|direct|office|whatsapp|scan|qr|follow us)\b/i;
const LABEL = /^(?:mobile|mob|telephone|tel|phone|cell|contact|whatsapp|ph)\s*[:.\-]?\s*/i;
const PHONE_CANDIDATE = /(?:\+?\d[\d\s().\-]{7,}\d)/g;
function distinct(values: string[]): string[] {
  const seen = new Set<string>(); return values.filter(raw => { const value = raw.trim(); const key = value.toLowerCase(); if (!value || seen.has(key)) return false; seen.add(key); return true; });
}
function extractPhones(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    const candidate = match[0].trim(); const digits = candidate.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15 || /^\d{4}[- /.]?\d{2}[- /.]?\d{2}$/.test(candidate)) continue;
    // Exclude obvious telephone-looking fragments of URLs or email identifiers.
    hits.push(candidate.replace(/\s+/g, ' '));
  }
  return distinct(hits);
}
const cleaned = (s: string) => s.replace(/^[\s:|•–-]+|[\s|•–-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
const titleCase = (s: string) => /^[A-Z\s.'-]+$/.test(s) ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s;
const nameLike = (s: string) => /^[\p{L}][\p{L} .'-]{3,65}$/u.test(s) && s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 5 && !JOB.test(s) && !COMPANY.test(s) && !ADDRESS.test(s) && !NOISE.test(s);
const singleWord = (s: string) => /^[\p{L}][\p{L}'-]{3,29}$/u.test(s) && !JOB.test(s) && !COMPANY.test(s) && !ADDRESS.test(s) && !NOISE.test(s);
const uppercaseWord = (s: string) => singleWord(s) && s === s.toUpperCase();
// An unlabelled name can be a single word. Only infer it from its proximity to
// an explicitly detected job title; do not treat every standalone word as a name.
function findSingleName<T extends { text: string; index: number }>(
  candidates: T[], job: T | undefined, occupied: Set<number>
): T | undefined {
  if (!job) return undefined;
  return candidates
    .filter(line => !occupied.has(line.index) && singleWord(line.text) && line.index < job.index && job.index - line.index <= 3)
    .sort((a, b) => a.index - b.index)
    .at(-1);
}
function findBrand<T extends { text: string; index: number }>(
  candidates: T[], job: T | undefined, name: T | undefined, occupied: Set<number>
): T | undefined {
  if (!job || !name) return undefined;
  // Brand names often consist of a single all-caps word without legal suffixes.
  // Restrict this heuristic to text immediately after the detected title, or
  // immediately before the name (as is common for logos at the top of cards).
  return candidates.find(line => !occupied.has(line.index) && uppercaseWord(line.text) && (
    (line.index > job.index && line.index - job.index <= 3) ||
    (line.index < name.index && name.index - line.index <= 2)
  ));
}
export function parseContact(lines: OCRLine[]): ParsedContact {
  const usable = lines.map((line, index) => ({ ...line, text: cleaned(line.text), index }))
    .filter(line => line.text && line.score >= 0.15);
  const originalText = usable.map(line => line.text).join('\n');
  const emails = distinct((originalText.match(EMAIL) || []).map(s => s.toLowerCase()));
  const websites = distinct((originalText.match(WEB) || []).filter(s => !emails.some(email => email.includes(s))));
  const phones = distinct(usable.flatMap(line => extractPhones(line.text.replace(LABEL, ''))));
  const occupied = new Set<number>();
  const candidateLines = usable.filter(line => {
    if (EMAIL.test(line.text)) { EMAIL.lastIndex = 0; occupied.add(line.index); return false; }
    EMAIL.lastIndex = 0;
    if (WEB.test(line.text)) { WEB.lastIndex = 0; occupied.add(line.index); return false; }
    WEB.lastIndex = 0;
    if (extractPhones(line.text).length) { occupied.add(line.index); return false; }
    return true;
  });
  const job = candidateLines.find(line => JOB.test(line.text));
  if (job) occupied.add(job.index);
  const knownCompany = candidateLines.find(line => !occupied.has(line.index) && COMPANY.test(line.text) && line.text.length <= 100);
  if (knownCompany) occupied.add(knownCompany.index);
  const name = candidateLines.find(line => !occupied.has(line.index) && nameLike(line.text))
    ?? findSingleName(candidateLines, job, occupied);
  if (name) occupied.add(name.index);
  const company = knownCompany ?? findBrand(candidateLines, job, name, occupied);
  if (company) occupied.add(company.index);
  const addressLines = candidateLines.filter(line => !occupied.has(line.index) && (ADDRESS.test(line.text) || /\b\d{5,6}\b/.test(line.text)));
  addressLines.forEach(line => occupied.add(line.index));
  const notes = candidateLines.filter(line => !occupied.has(line.index) && line.text.length > 2).map(line => line.text).join(' | ');
  const scores = usable.map(line => line.score).filter(Number.isFinite);
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const evidence = [name, company, job].filter(Boolean).length + Number(emails.length > 0) + Number(phones.length > 0);
  const confidenceScore = average >= 0.88 && evidence >= 3 ? 'High' : average >= 0.6 && evidence >= 2 ? 'Medium' : 'Low';
  return {
    fullName: name ? titleCase(name.text) : '',
    jobTitle: job?.text || '', companyName: company?.text || '',
    email: emails.join(', '), phone: phones.join(', '), website: websites[0] || '',
    address: addressLines.map(line => line.text).join(', '), notes,
    confidenceScore,
  };
}
