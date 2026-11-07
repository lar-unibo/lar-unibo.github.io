# lar-unibo.github.io

Website of the Laboratory of Automation and Robotics (LAR), Università di Bologna — <https://lar-unibo.github.io>.

Plain static HTML, CSS and JavaScript: no build step, no Jekyll (`.nojekyll`). GitHub Pages serves the files as they are on `master`.

## Structure

```
index.html                         home
research/index.html                research topics
deformable_linear_objects/index.html   main direction 1: results and papers by topic
human_robot_collaboration/index.html   main direction 2: results and papers by topic
projects/index.html
people/index.html
publications/index.html            publication list (updated from Google Scholar, see below)
assets/css/main.css                all styles (design tokens at the top)
assets/js/site.js                  header, menu, scroll effects, hero "cables", publication search/filters
files/                             images and PDFs
tools/update_publications.py       publication updater
```

Every page has the same header, footer and icon sprite. If you change one of them (e.g. add a menu item), change it in all seven pages.

After changing `assets/css/main.css` or `assets/js/site.js`, update the `?v=` date on their links in all seven pages, so browsers download the new version instead of a cached one.

## Editing content

- **People** — `people/index.html`: copy a `<li class="person">` block into the right group. Photos are square images in `files/images/people/`; without a photo use the initials avatar shown in the comment at the top of the list. Group counts update themselves.
- **Research topics, projects** — edit the matching page directly; each card is a self-contained block.
- **Main-direction pages** (`deformable_linear_objects/`, `human_robot_collaboration/`) — each section has an intro (image + text), a *Key papers* list and a *More papers* list. To add a paper, copy a `<li class="paper-row">` block into the right list (add `paper-row--key` for key papers), set its label (`pub-type--journal`, `--conference`, `--preprint` or `--chapter`) and update the section's paper count.
- **Icons** — `<svg class="icon" aria-hidden="true"><use href="#i-NAME"/></svg>`, with `NAME` one of the symbols in the sprite at the top of each page.

## Publications

The list follows [Prof. Gianluca Palli's Google Scholar profile](https://scholar.google.com/citations?user=EcrzJJMAAAAJ&hl=en), from 2019 on. Scholar decides which papers appear; Crossref, OpenAlex and arXiv fill in DOI, full author list, venue and pages. Preprints are grouped at the top; workshop papers (including Human-Friendly Robotics), European Robotics Forum chapters, theses, patents, errata, editorials and project deliverables are left out. Lab members (taken from `people/index.html`) are shown in bold.

A monthly cloud routine runs the updater and opens a pull request (`scholar-sync/YYYY-MM`) when there are new papers. To run it yourself:

```sh
python3 tools/update_publications.py --dry-run   # show what would be added
python3 tools/update_publications.py             # update publications/index.html
```

Only the Python standard library is needed. The updater never deletes or rewrites existing entries, so hand edits are kept: add PDF, code or dataset links as extra `chip-link`s inside an entry's `pub-links`. When a listed preprint gets published, it is replaced by the published version and its extra links are carried over.

If Scholar answers with a CAPTCHA (it can block cloud servers), open the profile in a browser, save the page and run `python3 tools/update_publications.py --scholar-html saved-page.html`. Scholar only lets scripts read the newest 100 entries, which is enough for monthly updates; years 2019–2022 were filled once from OpenAlex (entries marked `data-source="openalex"`).

## Local preview

```sh
python3 -m http.server 4000
```

Then open <http://localhost:4000>.
