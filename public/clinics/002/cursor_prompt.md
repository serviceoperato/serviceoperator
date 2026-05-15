You are working on the www.serviceopera.to website.

Task:
Integrate the SEA Clinic Pattaya public-data automation audit pack into the website as a polished case-study / demo audit section.

Files available:
- components/SeaClinicAuditSection.tsx
- components/seaClinicAuditData.ts
- data/*.json
- public/assets/*.svg (audit charts)
- content/*.md

Implementation instructions:
1. Add the React component to a new route or section named:
   /work/sea-clinic-pattaya-audit
   or integrate it into the current "Proof" / "Work" section.

2. Preserve the positioning:
   "Public data automation audit for Pattaya clinics"
   Do not imply SEA Clinic commissioned the audit.

3. Use the design language of www.serviceopera.to:
   - premium B2B
   - deep indigo / black / white
   - calm, sharp, operational
   - no cyberpunk
   - no medical claims beyond public positioning

4. Add the SVG visuals:
   - /assets/audit_lines.svg
   - /assets/automation_funnel.svg
   - /assets/competitor_radar.svg

5. Add a disclaimer near the bottom:
   "This audit is based only on public information. Ratings, review counts and prices should be refreshed before client delivery."

6. Use the JSON data from data/ instead of hardcoding where convenient.

7. Avoid scraping live websites from the frontend.
   Public refresh should happen server-side or manually.
