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
const ADDRESS = /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|block|floor|building|tower|suite|office|sector|plot|near|opposite|industrial area|nagar|colony|district|city|state|pin(?:code)?|zip|mandir|marg|layout|phase)\b/i;
const OFFICE_LABEL = /^(?:head|corporate|registered|branch|regional|site|main)\s+office\b/i;
const POSTAL = /\b\d{5,6}\b/;
const MEANINGFUL_TITLE_SUFFIX = /^(?:qa|qc|hr|it|ai|ii|iii|iv|v|r&d|operations|sales|marketing|finance|technical|engineering|product|business|executive|general|regional|senior|junior|assistant|associate|managing|deputy|digital|growth|strategy)$/i;
const NOISE = /^(?:tel|mobile|mob|phone|email|e-mail|website|web|www|address|contact|fax|direct|office|whatsapp|scan|qr|follow us)\b/i;
const LABEL = /^(?:mobile|mob|telephone|tel|phone|cell|contact|whatsapp|ph)\s*[:.\-]?\s*/i;
const PHONE_CANDIDATE = /(?:\+?\d[\d\s().\-]{7,}\d)/g;
function distinct(values: string[]): string[] {
  const seen = new Set<string>(); return values.filter(raw => { const value = raw.trim(); const key = value.toLowerCase(); if (!value || seen.has(key)) return false; seen.add(key); return true; });
}
function extractPhones(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.matchAll(PHONE_CANDIDATE)) {
    let candidate = match[0].trim();
    // OCR may append an unmatched "(2" or a lone digit after a complete number.
    // Only remove it when a full-length phone number precedes the fragment.
    const noisyTail = candidate.match(/^(.*?)(?:\s+\(\s*\d{1,2}|\s+\d)$/);
    if (noisyTail && noisyTail[1].replace(/\D/g, '').length >= 10) candidate = noisyTail[1].trim();
    candidate = candidate.replace(/[\s(.,;:|-]+$/, '').trim();
    if ((candidate.match(/\(/g) ?? []).length > (candidate.match(/\)/g) ?? []).length) {
      candidate = candidate.replace(/\([^)]*$/, '').trim();
    }
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15 || /^\d{4}[- /.]?\d{2}[- /.]?\d{2}$/.test(candidate)) continue;
    hits.push(candidate.replace(/\s+/g, ' '));
  }
  return distinct(hits);
}

const cleaned = (s: string) => s.replace(/^[\s:|•–-]+|[\s|•–-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
// OCR can wrap names in scan marks such as '~ Name =' or '| Name |'.
// Remove only edge artifacts, never punctuation within real names.
const cleanNameCandidate = (s: string) => s.replace(/^[\s~=_*#•|:;<>\[\]{}]+|[\s~=_*#•|:;<>\[\]{}]+$/g, '').trim();
// Remove stray OCR glyphs but keep legitimate title qualifiers (QA, HR, II, etc.).
const cleanJobTitle = (s: string) => {
  let title = s.replace(/[\s|:;*~=]+$/g, '').replace(/\s+\d{1,2}$/, '').trim();
  const match = title.match(/^(.*?)(?:\s+([A-Za-z]{1,2}))$/);
  if (match && JOB.test(match[1]) && !MEANINGFUL_TITLE_SUFFIX.test(match[2])) {
    // Only discard obviously duplicated, non-word OCR glyphs ("QQ", "ZZ").
    if (/^([A-Za-z])\1$/i.test(match[2])) title = match[1];
  }
  return title;
};
const cleanCompanyName = (s: string) => {
  const text = s.replace(/[\s|:;*~=]+$/g, '').trim();
  // Terminal repeated/isolated fragments immediately following a recognized
  // company legal suffix are OCR artifacts. Preserve meaningful suffixes.
  return text.replace(/(\b(?:pvt\.?\s*ltd\.?|private\s+limited|llp|ltd\.?|inc\.?))\s+([a-z]{1,2})(?:\s*[*:;|~]*)$/i, (whole, suffix: string, fragment: string) =>
    MEANINGFUL_TITLE_SUFFIX.test(fragment) ? whole : suffix).trim();
};
const hasOddWordPattern = (s: string) => {
  const words = s.split(/\s+/);
  return words.length >= 3 && words.filter(w => /^[A-Za-z]{1,2}$/.test(w)).length >= 2;
};
// Low-confidence garbage often consists of multiple tiny tokens, despite passing
// the original name regex. Such lines must not outrank a readable full name.
const plausibleName = (s: string) => nameLike(s) && !hasOddWordPattern(s);
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
export interface NameCandidateDiagnostic {
  original: string;
  normalized: string;
  ocrConfidence: number;
  rank: number | null;
  decision: 'selected' | 'candidate' | 'rejected';
  reason: string;
}
export interface ContactParseDiagnostics {
  nameCandidates: NameCandidateDiagnostic[];
  rawLines: Array<{ text: string; confidence: number; top?: number; left?: number }>;
  selectedName: string;
}
// Diagnostics remain in browser memory only; never add them to a MongoDB record.
export function parseContactWithDiagnostics(lines: OCRLine[]): { contact: ParsedContact; diagnostics: ContactParseDiagnostics } {
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
  // Prefer legible names adjacent to a designation. OCR frequently includes
  // unrelated small-print text above a real person's name.
  const nameEvidence = candidateLines
    .filter(line => !occupied.has(line.index))
    .map(line => ({ ...line, original: line.text, text: cleanNameCandidate(line.text) }));
  const rankName = (line: typeof nameEvidence[number]): number => {
    const distance = job ? Math.abs(line.index - job.index) : Infinity;
    const adjacentTitle = job && line.index < job.index && distance <= 2 ? 7 : 0;
    const afterTitle = job && line.index > job.index && distance <= 2 ? 1 : 0;
    const words = line.text.split(/\s+/);
    const solidWords = words.every(word => word.replace(/['.-]/g, '').length >= 3);
    return adjacentTitle + afterTitle +
      Math.min(3, Math.max(0, line.score) * 3) +
      (solidWords ? 3 : -3) - (line.text.length > 42 ? 3 : 0) - line.index * 0.05;
  };
  const ranked = nameEvidence.filter(line => plausibleName(line.text))
    .sort((a, b) => rankName(b) - rankName(a));
  const name = ranked[0] ?? findSingleName(candidateLines, job, occupied);
  if (name) occupied.add(name.index);
  const company = knownCompany ?? findBrand(candidateLines, job, name, occupied);
  if (company) occupied.add(company.index);
  // Recognize both office headings, and keep address continuation lines that
  // OCR may emit separately from their heading. Do not consume names/contacts.
  const addressLines: typeof candidateLines = [];
  let previousAddress: typeof candidateLines[number] | undefined;
  for (const line of candidateLines) {
    if (occupied.has(line.index)) { previousAddress = undefined; continue; }
    const explicit = OFFICE_LABEL.test(line.text) || ADDRESS.test(line.text) || POSTAL.test(line.text);
    const continuation = !!previousAddress && line.index - previousAddress.index <= 2 &&
      /(?:^\s*\d+[\w/-]*\s*,|,|\b(?:Bhopal|M\.?P\.?|India)\b)/i.test(line.text) &&
      !JOB.test(line.text) && !COMPANY.test(line.text) &&
      !extractPhones(line.text).length;
    if (explicit || continuation) {
      addressLines.push(line); occupied.add(line.index); previousAddress = line;
    } else previousAddress = undefined;
  }
  // Do not export obvious recognition garbage as factual contact notes.
  // Keep meaningful taglines, social handles, and unclassified text for review.
  const notes = candidateLines.filter(line => {
    if (occupied.has(line.index) || line.text.length <= 3 || line.score < 0.48) return false;
    const text = cleanNameCandidate(line.text);
    // An unassigned candidate next to the job title may be another OCR rendition
    // of a name. Don't export it as a factual note or tagline.
    if (job && Math.abs(line.index - job.index) <= 3 && (plausibleName(text) || hasOddWordPattern(text))) return false;
    const letters = [...line.text].filter(ch => /[\p{L}\p{N}]/u.test(ch)).length;
    return letters / line.text.length >= 0.62 && !hasOddWordPattern(text);
  }).map(line => line.text).join(' | ');
  const scores = usable.map(line => line.score).filter(Number.isFinite);
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const evidence = [name, company, job].filter(Boolean).length + Number(emails.length > 0) + Number(phones.length > 0);
  const confidenceScore = average >= 0.88 && evidence >= 4 && !!name && !!(emails.length || phones.length) ? 'High' : average >= 0.6 && evidence >= 2 ? 'Medium' : 'Low';
  const diagnostics: ContactParseDiagnostics = {
    selectedName: name?.text ?? '',
    rawLines: usable.map(line => ({ text: line.text, confidence: line.score, top: line.top, left: line.left })),
    nameCandidates: nameEvidence.map(line => {
      const valid = plausibleName(line.text);
      const selected = name?.index === line.index;
      return {
        original: line.original,
        normalized: line.text,
        ocrConfidence: line.score,
        rank: valid ? Number(rankName(line).toFixed(2)) : null,
        decision: selected ? 'selected' as const : valid ? 'candidate' as const : 'rejected' as const,
        reason: selected ? 'Best supported name candidate' :
          !valid ? 'Not a plausible person name after normalization' :
          'Lower score than the selected candidate; verify against the image',
      };
    }),
  };
  const contact: ParsedContact = {
    fullName: name ? titleCase(name.text) : '',
    jobTitle: job ? cleanJobTitle(job.text) : '', companyName: company ? cleanCompanyName(company.text) : '',
    email: emails.join(', '), phone: phones.join(', '), website: websites[0] || '',
    address: distinct(addressLines.map(line => line.text.replace(/^[\s|•~]+/, '').replace(/[\s|•~=]+$/, '').trim())).join('\n'), notes,
    confidenceScore,
  };
  return { contact, diagnostics };
}

export function parseContact(lines: OCRLine[]): ParsedContact {
  return parseContactWithDiagnostics(lines).contact;
}
