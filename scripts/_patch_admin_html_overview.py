from pathlib import Path

p = Path(__file__).resolve().parent.parent / "public" / "admin.html"
t = p.read_text(encoding="utf-8")
start = t.index('      <h3 class="tx-section-heading">AI-ready outputs</h3>')
end = t.index('      <h3 class="tx-section-heading tx-section-heading--secondary">')
lines = [
    '      <div id="txOverview" class="tx-overview" aria-label="Category overview"></div>',
    "",
    '      <header id="txCategoryHeader" class="tx-category-header" aria-live="polite"></header>',
    "",
    '      <div class="tx-toolbar-desktop">',
    '        <div id="txCatScroll" class="tx-cats" role="tablist" aria-label="Categories"></motion>',
    '        <div id="txStats" class="tx-stats tx-stats--compact" aria-hidden="true"></motion>',
    "      </motion>",
    "",
]
new = "\n".join(lines).replace("</motion>", "</div>").replace("<motion", "<div") + "\n"
p.write_text(t[:start] + new + t[end:], encoding="utf-8")
print("ok")
