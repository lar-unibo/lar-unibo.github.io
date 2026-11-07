#!/usr/bin/env python3
"""Update the publication list in publications/index.html from Google Scholar.

Source of truth: Prof. Gianluca Palli's Google Scholar profile (the lab head).
Scholar decides WHICH papers appear. Because Scholar shortens author lists and
venue names and gives no DOI, the details (DOI, full authors, venue, volume,
pages) are taken from Crossref and OpenAlex.

Rules
  * papers from 2019 onward;
  * workshop papers, European Robotics Forum (ERF) chapters and theses are left out,
    and so are things that are not papers: project deliverables and datasets
    (Zenodo, AMS Acta), patents, errata and editorials;
  * preprints (arXiv, ...) go in their own group at the top;
  * existing entries are never deleted or rewritten, so manual edits such as
    PDF or code links survive; a preprint is replaced by its published version
    (keeping its extra links) once Scholar lists the published paper.

Usage
  python3 tools/update_publications.py               fetch Scholar and update the page
  python3 tools/update_publications.py --dry-run     print what would change, write nothing
  python3 tools/update_publications.py --scholar-html saved.html [more.html ...]
        use profile page(s) saved from a browser instead of fetching Scholar
  python3 tools/update_publications.py --openalex-backfill
        also add OpenAlex works for years older than the Scholar page reaches
        (Scholar only allows the newest 100 entries to be fetched automatically)

Only the Python standard library is needed.
"""
import argparse
import difflib
import html
import json
import re
import sys
import textwrap
import time
import unicodedata
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SCHOLAR_USER = "EcrzJJMAAAAJ"          # Gianluca Palli
ORCID = "0000-0001-9457-4643"          # Gianluca Palli (used to find his OpenAlex record)
SINCE = 2019

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "publications" / "index.html"
PEOPLE_PAGE = ROOT / "people" / "index.html"
START = "<!-- PUBLICATIONS:START"
END = "<!-- PUBLICATIONS:END -->"

SCHOLAR_URL = f"https://scholar.google.com/citations?user={SCHOLAR_USER}&hl=en&sortby=pubdate&pagesize=100"
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
API_UA = "lar-unibo-website-sync/1.0 (+https://lar-unibo.github.io)"

# "Human-Friendly Robotics" is the International Workshop on Human-Friendly Robotics (HFR).
EXCLUDE_VENUE = re.compile(r"workshop|human-friendly robotics|european robotics forum|\berf\b|thesis|dissertation"
                           r"|patent|zenodo|ams ?acta", re.I)
EXCLUDE_TITLE = re.compile(r"^(correction to|erratum|corrigendum|retraction|guest editorial|editorial)\b"
                           r"|^(intelliman|remodel)\.|\bWP\d+\b|data management plan", re.I)
SKIP_OPENALEX_TYPES = {"dataset", "other", "editorial", "erratum", "paratext", "software", "report", "peer-review",
                       "retraction", "standard", "grant", "letter", "supplementary-materials"}
SKIP_CROSSREF_TYPES = {"dataset", "report", "component", "other", "standard", "peer-review", "database", "editorial"}
SKIP_DOI_PREFIXES = ("10.5281/", "10.6092/")  # Zenodo, AMS Acta (deliverables and datasets)
PREPRINT_VENUE = re.compile(r"arxiv|preprint|techrxiv|biorxiv|ssrn|research square", re.I)
PROCEEDINGS_AS_JOURNAL = re.compile(r"ifac-papersonline|procedia", re.I)  # conference papers published as journals
CONFERENCE_WORDS = re.compile(r"conference|proceedings|symposium|congress|ifac-papersonline|procedia|\bicra\b|\biros\b", re.I)
KIND_LABEL = {"journal": "Journal", "conference": "Conference", "preprint": "Preprint", "chapter": "Book chapter"}
KIND_ORDER = {"journal": 0, "conference": 1, "chapter": 2, "preprint": 3}
GENERATED_LABELS = {"paper", "arxiv", "ssrn", "doi", "scholar"}


# --------------------------------------------------------------------------- helpers
def log(*a):
    print(*a, file=sys.stderr)


def get(url, ua=API_UA, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 - retry any network error
            if i == tries - 1:
                raise
            log(f"  retry {url[:80]}… ({e})")
            time.sleep(2 * (i + 1))


def get_json(url):
    time.sleep(0.15)  # be polite to the public APIs
    return json.loads(get(url))


def norm(s):
    s = unicodedata.normalize("NFKD", html.unescape(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slug(title):
    return norm(title).replace(" ", "-")[:90]


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", html.unescape(s or "")).strip()


def esc(s):
    return html.escape(str(s), quote=True)


# --------------------------------------------------------------------------- Scholar
class ScholarParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.cur, self.cap = [], None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "tr" and "gsc_a_tr" in cls:
            self.cur = {"title": "", "link": "", "grays": [], "year": ""}
        if self.cur is None:
            return
        if tag == "a" and "gsc_a_at" in cls:
            self.cap = "title"
            self.cur["link"] = urllib.parse.urljoin("https://scholar.google.com", html.unescape(a.get("href", "")))
        elif tag == "div" and "gs_gray" in cls:
            self.cur["grays"].append("")
            self.cap = "gray"
        elif tag == "span" and "gsc_a_h" in cls:
            self.cap = "year"

    def handle_endtag(self, tag):
        if tag in ("a", "div", "span"):
            self.cap = None
        if tag == "tr" and self.cur is not None:
            g = self.cur.pop("grays")
            row = {
                "title": " ".join(self.cur["title"].split()),
                "authors": " ".join(g[0].split()) if g else "",
                "venue": " ".join(g[1].split()) if len(g) > 1 else "",
                "year": int(self.cur["year"]) if self.cur["year"].strip().isdigit() else 0,
                "link": self.cur["link"],
            }
            if row["title"]:
                self.rows.append(row)
            self.cur = None

    def handle_data(self, d):
        if self.cur is None or not self.cap:
            return
        if self.cap == "gray":
            self.cur["grays"][-1] += d
        else:
            self.cur[self.cap] += d


def scholar_rows(pages):
    """Return one list of rows per page."""
    per_page = []
    for text in pages:
        if "gs_captcha" in text or "unusual traffic" in text.lower():
            raise RuntimeError("Google Scholar answered with a CAPTCHA. Run the script from another network, "
                               "or save the profile page from a browser and pass it with --scholar-html.")
        p = ScholarParser()
        p.feed(text)
        per_page.append(p.rows)
    if not per_page or not per_page[0]:
        raise RuntimeError("No publications found on the Scholar page (layout change or blocked request).")
    return per_page


def keep_row(r):
    return (r["year"] >= SINCE and not EXCLUDE_VENUE.search(r["venue"])
            and not EXCLUDE_VENUE.search(r["title"]) and not EXCLUDE_TITLE.search(r["title"]))


def not_a_paper(work=None, crossref=None, doi=""):
    """True for deliverables, datasets, errata, ... that Scholar sometimes lists."""
    if doi.lower().startswith(SKIP_DOI_PREFIXES):
        return True
    if work:
        src = (work.get("primary_location") or {}).get("source") or {}
        if work.get("type") in SKIP_OPENALEX_TYPES or (src.get("type") == "repository" and work.get("type") != "preprint"):
            return True
        if EXCLUDE_TITLE.search(work.get("display_name") or ""):
            return True
    if crossref and crossref.get("type") in SKIP_CROSSREF_TYPES:
        return True
    return False


def dedupe(rows):
    """Merge Scholar duplicates; prefer the published version over a preprint."""
    out = []
    for r in rows:
        for i, o in enumerate(out):
            if similar(r["title"], o["title"]) >= 0.93:
                if PREPRINT_VENUE.search(o["venue"]) and not PREPRINT_VENUE.search(r["venue"]):
                    out[i] = r
                break
        else:
            out.append(r)
    return out


# --------------------------------------------------------------------------- OpenAlex / Crossref
_author_works = None


def openalex_author_works():
    global _author_works
    if _author_works is not None:
        return _author_works
    _author_works = []
    try:
        author = get_json(f"https://api.openalex.org/authors/orcid:{ORCID}")
        aid = author["id"].rsplit("/", 1)[-1]
        cursor = "*"
        while cursor:
            url = (f"https://api.openalex.org/works?filter=author.id:{aid},publication_year:{SINCE}-"
                   f"&per-page=200&cursor={urllib.parse.quote(cursor)}")
            d = get_json(url)
            _author_works += d["results"]
            cursor = d["meta"].get("next_cursor")
    except Exception as e:  # noqa: BLE001
        log(f"  OpenAlex author lookup failed: {e}")
    return _author_works


def best_match(title, candidates, key):
    best, score = None, 0.0
    for c in candidates:
        s = similar(title, key(c) or "")
        if s > score:
            best, score = c, s
    return best if score >= 0.9 else None


def is_repository(w):
    return (((w.get("primary_location") or {}).get("source") or {}).get("type")) == "repository"


def openalex_match(title):
    works = openalex_author_works()
    # Prefer the publisher's record over repository copies (Zenodo, institutional archives).
    w = (best_match(title, [x for x in works if not is_repository(x)], lambda w: w.get("display_name"))
         or best_match(title, works, lambda w: w.get("display_name")))
    if w:
        return w
    try:
        d = get_json("https://api.openalex.org/works?per-page=5&search=" + urllib.parse.quote(title))
        return best_match(title, d.get("results", []), lambda w: w.get("display_name"))
    except Exception as e:  # noqa: BLE001
        log(f"  OpenAlex search failed: {e}")
        return None


def arxiv_meta(arxiv_id):
    """Title and full author list of an arXiv preprint (export.arxiv.org API)."""
    try:
        xml = get(f"https://export.arxiv.org/api/query?id_list={arxiv_id}")
        entry = xml.split("<entry>", 1)[1]
        title = " ".join(html.unescape(re.search(r"<title>(.*?)</title>", entry, re.S).group(1)).split())
        authors = [" ".join(html.unescape(a).split()) for a in re.findall(r"<name>(.*?)</name>", entry, re.S)]
        return title, authors
    except Exception as e:  # noqa: BLE001
        log(f"  arXiv lookup failed for {arxiv_id}: {e}")
        return None, None


def crossref_by_doi(doi):
    try:
        return get_json("https://api.crossref.org/works/" + urllib.parse.quote(doi))["message"]
    except Exception as e:  # noqa: BLE001
        log(f"  Crossref lookup failed for {doi}: {e}")
        return None


def crossref_search(title):
    try:
        d = get_json("https://api.crossref.org/works?rows=5&query.bibliographic=" + urllib.parse.quote(title))
        return best_match(title, d["message"].get("items", []), lambda m: strip_tags((m.get("title") or [""])[0]))
    except Exception as e:  # noqa: BLE001
        log(f"  Crossref search failed: {e}")
        return None


# --------------------------------------------------------------------------- building entries
def scholar_authors(s):
    """'A Caporali, G Palli, ...' -> ['A. Caporali', 'G. Palli', 'et al.']"""
    out = []
    for a in s.split(","):
        a = a.strip()
        if not a:
            continue
        if a in ("...", "…"):
            out.append("et al.")
            continue
        parts = a.split()
        if len(parts) > 1 and parts[0].isupper() and len(parts[0]) <= 3:
            parts[0] = " ".join(ch + "." for ch in parts[0])
        out.append(" ".join(parts))
    return out


def entry_from_row(row):
    """Build a publication dict for a Scholar row, enriched with Crossref/OpenAlex."""
    e = {"title": row["title"], "year": row["year"], "authors": scholar_authors(row["authors"]),
         "venue": re.sub(r",?\s*\d{4}$", "", row["venue"]).strip(), "details": "", "doi": "",
         "kind": None, "links": [], "scholar": row["link"], "source": "scholar"}
    preprint = bool(PREPRINT_VENUE.search(row["venue"]))
    arxiv = re.search(r"arXiv[:\s]*([0-9]{4}\.[0-9]{4,5})", row["venue"], re.I)

    w = None if preprint else openalex_match(row["title"])
    doi = (w.get("doi") or "").replace("https://doi.org/", "") if w else ""
    cr = crossref_by_doi(doi) if doi else (None if preprint else crossref_search(row["title"]))
    if cr and not doi:
        doi = cr.get("DOI", "")
    if not preprint and not_a_paper(w, cr, doi):
        log(f"  - skipped (not a paper): {row['title']}")
        return None
    if cr and crossref_excluded(cr):
        log(f"  - skipped (workshop / ERF): {row['title']}")
        return None
    if not preprint and not w and not cr and not row["venue"]:
        log(f"  - skipped (no venue, no match; e.g. a patent): {row['title']}")
        return None

    oa_source_type = ""
    if w:
        e["title"] = strip_tags(w.get("display_name")) or e["title"]
        names = [a["author"]["display_name"] for a in w.get("authorships", []) if a.get("author")]
        if names:
            e["authors"] = names
        src = (w.get("primary_location") or {}).get("source") or {}
        e["venue"] = src.get("display_name") or e["venue"]
        oa_source_type = src.get("type") or ""
        b = w.get("biblio") or {}
        e["details"] = details(b.get("volume"), b.get("issue"), b.get("first_page"), b.get("last_page"))
    if cr:
        apply_crossref(e, cr)
    e["title"] = clean_title(e["title"])
    e["doi"] = doi
    e["kind"] = classify(preprint, cr.get("type") if cr else "", oa_source_type, e["venue"] or row["venue"])

    if e["kind"] == "preprint" and arxiv:
        title, names = arxiv_meta(arxiv.group(1))
        if title:
            e["title"] = title
        if names:
            e["authors"] = names
        e["links"].append(("arXiv", "paper", f"https://arxiv.org/abs/{arxiv.group(1)}"))
        e["venue"] = f"arXiv preprint arXiv:{arxiv.group(1)}"
    elif e["kind"] == "preprint" and re.search(r"SSRN\s*(\d+)", row["venue"]):
        e["links"].append(("SSRN", "paper", "https://ssrn.com/abstract=" + re.search(r"SSRN\s*(\d+)", row["venue"]).group(1)))
    elif doi:
        e["links"].append(("Paper", "paper", f"https://doi.org/{doi}"))
    else:
        e["links"].append(("Scholar", "link", row["link"]))
    return e


def entry_from_openalex(w):
    """Build an entry for an OpenAlex work (backfill). Returns None if it should be left out."""
    src = (w.get("primary_location") or {}).get("source") or {}
    b = w.get("biblio") or {}
    doi = (w.get("doi") or "").replace("https://doi.org/", "")
    venue = src.get("display_name") or ""
    e = {"title": strip_tags(w.get("display_name")), "year": w.get("publication_year") or 0,
         "authors": [a["author"]["display_name"] for a in w.get("authorships", []) if a.get("author")],
         "venue": venue, "details": details(b.get("volume"), b.get("issue"), b.get("first_page"), b.get("last_page")),
         "doi": doi, "links": [], "scholar": "", "source": "openalex"}
    cr = crossref_by_doi(doi) if doi else None
    if cr and (crossref_excluded(cr) or cr.get("type") in SKIP_CROSSREF_TYPES):
        log(f"  - skipped (workshop / ERF / not a paper): {e['title']}")
        return None
    if cr:
        apply_crossref(e, cr)
    e["title"] = clean_title(e["title"])
    e["kind"] = classify(w.get("type") == "preprint", cr.get("type") if cr else "", src.get("type") or "", e["venue"])
    if doi:
        e["links"].append(("Paper", "paper", f"https://doi.org/{doi}"))
    return e


def apply_crossref(e, cr):
    t = strip_tags((cr.get("title") or [""])[0])
    if t:
        e["title"] = t
    names = [" ".join(x for x in (a.get("given"), a.get("family")) if x) for a in cr.get("author", [])]
    names = [n for n in names if n]
    if names:
        e["authors"] = names
    ct = (cr.get("container-title") or [""])[0]
    if ct:
        e["venue"] = strip_tags(ct)
    first, last = (cr.get("page", "").split("-", 1) + [""])[:2] if cr.get("page") else (None, None)
    e["details"] = details(cr.get("volume"), cr.get("issue"), first, last) or e["details"]


def details(volume, issue, first, last):
    bits = []
    if volume:
        bits.append(f"vol. {volume}")
    if issue:
        bits.append(f"no. {issue}")
    if first:
        bits.append(f"pp. {first}–{last}" if last and last != first else f"p. {first}")
    return ", ".join(bits)


def classify(preprint, crossref_type, openalex_source_type, venue):
    v = venue or ""
    if preprint or crossref_type == "posted-content" or PREPRINT_VENUE.search(v):
        return "preprint"
    if PROCEEDINGS_AS_JOURNAL.search(v) or crossref_type == "proceedings-article":
        return "conference"
    if crossref_type == "journal-article":
        return "journal"
    if crossref_type in ("book-chapter", "book"):
        return "conference" if CONFERENCE_WORDS.search(v) else "chapter"
    if openalex_source_type == "conference":
        return "conference"
    if openalex_source_type == "journal":
        return "journal"
    if CONFERENCE_WORDS.search(v):
        return "conference"
    return "chapter" if openalex_source_type == "book series" else "journal"


def crossref_excluded(cr):
    """Workshop / ERF papers often only show the event in Crossref (e.g. Springer proceedings)."""
    texts = list(cr.get("container-title") or []) + [((cr.get("event") or {}).get("name") or "")]
    return any(EXCLUDE_VENUE.search(t) for t in texts if t)


def clean_title(t):
    return re.sub(r"\s*--\s*", "–", " ".join((t or "").split()))


# --------------------------------------------------------------------------- lab members (bold in author lists)
def lab_members():
    text = PEOPLE_PAGE.read_text(encoding="utf-8")
    names = re.findall(r'<div class="person-info">\s*<h3>(.*?)</h3>', text, re.S)
    names += re.findall(r'class="alumni-name"[^>]*>(.*?)</a>', text, re.S)
    out = []
    for n in names:
        n = re.sub(r'<span class="prefix">.*?</span>', "", n)
        t = norm(strip_tags(n)).split()
        if len(t) > 1:
            out.append(t)
    return out


def is_member(name, members):
    t = norm(name.replace(".", " ")).split()
    if len(t) < 2:
        return False
    for m in members:
        for k in (3, 2, 1):  # last name may have several words (e.g. "De Gregorio")
            if len(t) > k and len(m) > k and t[-k:] == m[-k:]:
                # "A. Caporali" matches on the initial; "Alessio Caporali" needs the full first name
                if (len(t[0]) == 1 and t[0] == m[0][0]) or t[0] == m[0]:
                    return True
    return False


# --------------------------------------------------------------------------- HTML
def icon(name):
    return f'<svg class="icon" aria-hidden="true"><use href="#i-{name}"/></svg>'


def chip(label, ic, url):
    return f'<a class="chip-link" href="{esc(url)}" target="_blank" rel="noopener">{icon(ic)}<span>{esc(label)}</span></a>'


def render_entry(e, members, extra_links=()):
    authors = ", ".join(f'<span class="me">{esc(a)}</span>' if is_member(a, members) else esc(a) for a in e["authors"])
    first = e["links"][0][2] if e["links"] else ""
    title = f'<a href="{esc(first)}" target="_blank" rel="noopener">{esc(e["title"])}</a>' if first else esc(e["title"])
    venue = ", ".join(x for x in (esc(e["venue"]), esc(e["details"])) if x)
    links = [chip(label, ic, url) for label, ic, url in e["links"]] + list(extra_links)
    src = ' data-source="openalex"' if e.get("source") == "openalex" else ""
    lines = [
        f'<li class="pub" data-type="{e["kind"]}" data-year="{e["year"]}" data-key="{slug(e["title"])}"{src}>',
        f'  <div class="pub-meta"><span class="pub-type pub-type--{e["kind"]}">{KIND_LABEL[e["kind"]]}</span></div>',
        f'  <h3 class="pub-title">{title}</h3>',
    ]
    if authors:
        lines.append(f'  <p class="pub-authors">{authors}</p>')
    if venue:
        lines.append(f'  <p class="pub-venue">{venue}</p>')
    if links:
        lines.append('  <div class="pub-links">')
        lines += [f"    {l}" for l in links]
        lines.append("  </div>")
    lines.append("</li>")
    return "\n".join(lines)


ENTRY_RE = re.compile(r'<li class="pub"[^>]*>.*?</li>', re.S)


def parse_existing(region):
    out = []
    for m in ENTRY_RE.finditer(region):
        # Include the first line's indentation, then remove only the common indentation,
        # so a re-render keeps each entry byte-for-byte (small, reviewable diffs).
        line_start = region.rfind("\n", 0, m.start()) + 1
        block = textwrap.dedent(region[line_start:m.start()] + m.group(0))
        attrs = dict(re.findall(r'data-(type|year|key)="([^"]*)"', block.split(">", 1)[0]))
        title = strip_tags((re.search(r'<h3 class="pub-title">(.*?)</h3>', block, re.S) or [None, ""])[1])
        out.append({"html": block, "kind": attrs.get("type", "journal"),
                    "year": int(attrs.get("year") or 0), "key": attrs.get("key", ""), "title": title})
    return out


def extra_links_of(block):
    """Links added by hand (PDF, code, dataset, ...) that should survive a rewrite."""
    out = []
    for m in re.finditer(r'<a class="chip-link".*?</a>', block, re.S):
        label = strip_tags(m.group(0)).strip().lower()
        if label not in GENERATED_LABELS:
            out.append(m.group(0))
    return out


def indent_block(block, n):
    pad = " " * n
    return "\n".join(pad + l if l.strip() else "" for l in block.splitlines())


def render_list(entries):
    pre = [e for e in entries if e["kind"] == "preprint"]
    pub = [e for e in entries if e["kind"] != "preprint"]
    groups = []
    if pre:
        groups.append(("preprints", "Preprints", pre))
    for y in sorted({e["year"] for e in pub}, reverse=True):
        # journals first, then conferences; new papers (Scholar is newest-first) at the top of their block
        items = sorted([e for e in pub if e["year"] == y], key=lambda e: (KIND_ORDER.get(e["kind"], 9), not e.get("new")))
        groups.append((str(y), str(y), items))
    out = []
    for key, label, items in groups:
        n = len(items)
        out.append(f'          <section class="pub-year" data-year="{key}">')
        out.append(f'            <h2 class="pub-year-label">{label}<small>{n} {"paper" if n == 1 else "papers"}</small></h2>')
        out.append('            <ol class="pubs">')
        out += [indent_block(e["html"], 14) for e in items]
        out.append("            </ol>")
        out.append("          </section>")
    return "\n".join(out)


# --------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scholar-html", nargs="+", metavar="FILE", help="Scholar profile page(s) saved from a browser")
    ap.add_argument("--openalex-backfill", action="store_true", help="add OpenAlex works older than the Scholar page reaches")
    ap.add_argument("--dry-run", action="store_true", help="print the changes, do not write the page")
    args = ap.parse_args()

    page = PAGE.read_text(encoding="utf-8")
    s, e_ = page.find(START), page.find(END)
    if s < 0 or e_ < 0:
        sys.exit(f"Markers {START} / {END} not found in {PAGE}")
    s_end = page.index("-->", s) + 3
    existing = parse_existing(page[s_end:e_])
    members = lab_members()

    if args.scholar_html:
        pages = [Path(p).read_text(encoding="utf-8", errors="replace") for p in args.scholar_html]
    else:
        log(f"Fetching {SCHOLAR_URL}")
        pages = [get(SCHOLAR_URL, ua=BROWSER_UA)]
    per_page = scholar_rows(pages)
    # The first page is the newest-first profile page; older years are only partly on it.
    oldest = min(r["year"] for r in per_page[0] if r["year"])
    rows = dedupe([r for page_rows in per_page for r in page_rows if keep_row(r)])
    log(f"Scholar: {len(rows)} papers from {SINCE} on (page reaches back to {oldest}); {len(existing)} already listed")

    def find(title):
        for x in existing:
            if similar(title, x["title"]) >= 0.92:
                return x
        return None

    seen_dois = {d.lower() for x in existing for d in re.findall(r'https://doi\.org/([^"]+)', x["html"])}
    added, upgraded = [], []
    for r in rows:
        x = find(r["title"])
        if x and not (x["kind"] == "preprint" and not PREPRINT_VENUE.search(r["venue"])):
            continue
        e = entry_from_row(r)
        if e is None or e["year"] < SINCE:
            continue
        if not x:
            # Scholar titles can differ from the published one: check again after enrichment.
            if find(e["title"]) or (e["doi"] and e["doi"].lower() in seen_dois):
                continue
            if e["kind"] == "preprint" and any(similar(e["title"], y["title"]) >= 0.92 for y in existing):
                continue
        if e["doi"]:
            seen_dois.add(e["doi"].lower())
        if x:  # published version of a listed preprint
            if e["kind"] == "preprint":
                continue
            x.update(kind=e["kind"], year=e["year"], key=slug(e["title"]), title=e["title"],
                     html=render_entry(e, members, extra_links_of(x["html"])))
            upgraded.append(e["title"])
        else:
            existing.append({"html": render_entry(e, members), "kind": e["kind"], "year": e["year"],
                             "key": slug(e["title"]), "title": e["title"], "new": True})
            added.append(f'{e["year"]} [{e["kind"]}] {e["title"]}')

    if args.openalex_backfill:
        for w in openalex_author_works():
            if (w.get("publication_year") or 0) > oldest or w.get("type") not in ("article", "conference-paper", "book-chapter"):
                continue
            if not_a_paper(w, doi=(w.get("doi") or "").replace("https://doi.org/", "")):
                continue
            e = entry_from_openalex(w)
            if e is None or not e["title"] or EXCLUDE_VENUE.search(e["venue"]) or EXCLUDE_VENUE.search(e["title"]) or e["kind"] == "preprint":
                continue
            if find(e["title"]) or (e["doi"] and e["doi"].lower() in seen_dois):
                continue
            seen_dois.add(e["doi"].lower())
            existing.append({"html": render_entry(e, members), "kind": e["kind"], "year": e["year"],
                             "key": slug(e["title"]), "title": e["title"]})
            added.append(f'{e["year"]} [{e["kind"]}] {e["title"]}  (OpenAlex backfill)')

    for line in added:
        log(f"  + {line}")
    for t in upgraded:
        log(f"  ↑ preprint now published: {t}")
    if not added and not upgraded:
        log("No changes.")
        return
    if args.dry_run:
        log("Dry run: page not written.")
        return

    region = "\n" + render_list(existing) + "\n"
    PAGE.write_text(page[:s_end] + region + page[e_:], encoding="utf-8")
    log(f"Updated {PAGE.relative_to(ROOT)}: {len(added)} added, {len(upgraded)} upgraded, {len(existing)} total.")


if __name__ == "__main__":
    main()
