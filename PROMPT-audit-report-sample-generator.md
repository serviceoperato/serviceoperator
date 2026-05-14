# MASTER PROMPT: AI Automation Audit Report Sample Generator

## PROJECT OBJECTIVE
Create a comprehensive, professional AI automation audit report sample in HTML5 designed to demonstrate Operato's analytical capabilities to prospective healthcare clinics in Thailand. The report should showcase deep operational analysis, data visualization, and actionable recommendations without exposing any real patient or business data.

**Target Audience**: Healthcare business owners and decision-makers in Thailand (medical clinics, wellness centers, beauty clinics, health coaching services)
**Primary Use Case**: Homepage showcase section ("See What We Analyze" / "Our Audit Capability")
**Key Message**: "We don't just identify gaps. We quantify them with clinical precision and map the entire patient journey."

---

## DESIGN PHILOSOPHY

### Visual Language
- **Color Palette**: 
  - Primary: #6366f1 (Indigo) — trust, professionalism
  - Accent: #10b981 (Green) for positive metrics
  - Warning: #f59e0b (Amber) for manual/partial process
  - Critical: #ef4444 (Red) for gaps/friction
  - Neutral: #64748b (Slate) for secondary text
  - Background: Soft gradient from #f5f7ff to #f9f5ff

- **Typography**:
  - Headlines: Bold (700-800 weight), 18-48px
  - Body: Regular (400-600 weight), 13-16px
  - Labels: 11-12px, uppercase, letter-spaced, 600 weight
  - Tone: Clinical, data-driven, never marketing-speak

- **Layout**:
  - Max-width: 1400px, centered, 20px mobile padding
  - Card-based sections with subtle shadows (0 4px 20px rgba(0,0,0,0.08))
  - Consistent 40px vertical padding between sections
  - Grid layouts that collapse to single column on mobile (< 768px)

### Content Tone
- **NOT**: "This clinic is amazing! We found hidden potential!"
- **YES**: "Analysis reveals 5 operational friction points causing 18-25 day delays in patient feedback cycles. Automation reduces this to 3-5 days."
- **Style**: Diagnostic, quantified, specific, actionable. Use numbers, not adjectives.

---

## MANDATORY SECTIONS (In Order)

### 1. HEADER SECTION
**Purpose**: Establish credibility and provide audit context at first glance.

**Content Structure**:
```
[Badge: "🏥 AI AUTOMATION AUDIT" in light purple]

[Main Title: 48px, bold]
"Bangkok Integrated Health Center"

[Subtitle: 28px, italic, indigo color]
"Bangkok, Thailand"

[Description Paragraph: 16px, max 800px width]
- 2-3 sentences explaining the scope
- Reference "comprehensive AI readiness audit"
- Mention service lines analyzed
- Use clinical language, not marketing

[Header Meta Grid: 5 columns responsive]
- Analyzed By: "Operato AI"
- Audit Date: "May 2026" 
- Service Lines: "[Count] Lines" (e.g., "4 Lines")
- Audit Score: X.X/10 (use color coding: 7.8/10 = amber)
- Rating: Star display (e.g., ★★★★☆ 4.3/5)

[Visual Divider: 1px border #e2e8f0]
```

**Design Details**:
- White background card with border-radius 16px
- 60px padding top/bottom, 40px left/right
- Box-shadow: 0 4px 20px rgba(0,0,0,0.08)
- Margin-bottom: 40px

---

### 2. DASHBOARD: 12-MONTH TREND CHART
**Purpose**: Demonstrate data visualization capability and 12-month performance visibility.

**Chart Type**: Chart.js Line + Multi-Axis
**Chart ID**: `trendChart`

**Datasets** (4 parallel metrics):
1. **Avg Rating (x10)** 
   - Y-Axis Left (0-50 scale, displayed as "average rating")
   - Color: #6366f1 (Indigo)
   - Fill: Light indigo background
   - Sample Data (Jun-May): [41, 42, 40, 41, 42, 43, 42, 41, 42, 43, 42, 43]
   - Represents: Online reputation stability

2. **Review Volume**
   - Y-Axis Right (0-25 scale)
   - Color: #10b981 (Green)
   - Fill: Light green background
   - Sample Data: [12, 15, 14, 18, 16, 19, 20, 18, 21, 19, 22, 18]
   - Represents: Patient feedback growth

3. **Response Time (hours)**
   - Y-Axis Right (0-25 scale)
   - Color: #f59e0b (Amber)
   - BorderDash: [5, 5] (dashed line)
   - Sample Data: [18, 16, 19, 17, 20, 18, 21, 19, 22, 20, 24, 18]
   - Represents: Inquiry response delay

4. **Booking Conversion %**
   - Y-Axis Right (0-40 scale)
   - Color: #ef4444 (Red)
   - BorderDash: [5, 5] (dashed line)
   - Sample Data: [28, 30, 27, 32, 29, 34, 31, 35, 32, 36, 33, 37]
   - Represents: Sales funnel efficiency

**X-Axis Labels**: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']

**Chart Container**:
- Height: 300px, position: relative
- Margin-bottom: 40px
- Background: White card (same as other dashboard sections)
- Legend: Top, font 12px, point style icons

**Context Text** (above chart):
- Section Title: "12-Month Public Signal Trend"
- Section Description: "Four key metrics tracked across last 12 months: Patient Review Velocity, Booking Conversion Rate, Average Response Time, and Digital Sentiment Score."

---

### 3. KPI CARDS GRID
**Purpose**: Surface the four most critical findings at a glance.

**Grid Layout**: 
- CSS Grid: `repeat(auto-fit, minmax(240px, 1fr))`
- Gap: 24px
- 4 cards that collapse to 2-column on tablet, 1-column on mobile

**Card 1: Revenue Friction Gap**
- Icon: ⚠️
- Label: "REVENUE FRICTION GAP"
- Value: "฿2.1M"
- Detail: "Annual revenue leakage through manual booking process and delayed responses"
- Border-left Color: #6366f1 (Indigo)

**Card 2: Review Velocity**
- Icon: ⭐
- Label: "REVIEW VELOCITY (POST-AUTOMATION)"
- Value: "3-5 days"
- Detail: "Current: 18-25 days. Target post-automation: < 5 days"
- Border-left Color: #10b981 (Green)

**Card 3: Inquiry Response Time**
- Icon: ⏱️
- Label: "INQUIRY RESPONSE TIME"
- Value: "6-24h"
- Detail: "Currently manual. Post-automation: < 2 minutes across all channels"
- Border-left Color: #f59e0b (Amber)

**Card 4: 12-Month ROI**
- Icon: 💰
- Label: "CONSERVATIVE 12-MONTH ROI"
- Value: "฿7.8M"
- Detail: "Range: 6.2M–10.5M. Includes booking recovery + operational savings"
- Border-left Color: #10b981 (Green)

**Card Styling**:
- Background: Linear gradient from #f8fafc to #f1f5ff
- Border-radius: 12px
- Padding: 28px
- Border-left: 4px solid [color per card]
- Hover: `transform: translateY(-4px)` with 0.3s ease transition
- Icon font-size: 32px, margin-bottom: 12px
- Value: 36px, font-weight 800, color #1a1a2e
- Label: 12px uppercase, letter-spaced, font-weight 700
- Detail: 13px, color #64748b, line-height 1.6

---

### 4. TABBED NAVIGATION & CONTENT
**Purpose**: Organize deep analysis into digestible sections without overwhelming single page length.

**Tab Navigation Bar**:
- Flex layout, horizontal scroll on mobile
- Border-bottom: 2px solid #e2e8f0
- Padding-bottom: 16px
- Gap: 8px between buttons

**Tab Buttons**:
- Background: None
- Padding: 8px 16px
- Font: 13px, weight 600, uppercase, letter-spaced
- Color: #64748b (inactive) → #6366f1 (active)
- Active state: Color #6366f1 + border-bottom 3px #6366f1

**Tab Contents** (4 total):

#### TAB 1: PATIENT JOURNEY
**Section Heading**: "Patient Journey Analysis"
**Section Description**: "Five-stage funnel from discovery to follow-up. Each stage includes friction points identified through public data analysis and operational flow mapping."

**Timeline Structure**: 5 Journey Stages

**Each Stage Contains**:
```
[Stage Number: "STAGE 1", "STAGE 2", etc.]
[Stage Icon & Title: 28px icon + 20px bold title]
[Status Badge: Green="Functional", Amber="Manual Process", Red="Critical Gap"]
[Stage Content Box: White, border-left 3px #e2e8f0, padding 24px]
  [Brief description of current state]
  [Bulleted gap list with ✗ icon prefix]
```

**5 Stages** (in order):
1. **Discovery** (Icon: 🔍)
   - Status: "Functional"
   - Description: "Ranks organically for [relevant keywords]. Strong local presence."
   - Gaps:
     - No paid search strategy detected — organic-only creates CAC ceiling
     - Limited service line keywords

2. **First Contact** (Icon: 💬)
   - Status: "Critical Gap"
   - Description: "No live chat, no WhatsApp integration, email only — creates 6-24 hour response lag."
   - Gaps:
     - No instant communication widget on website
     - WhatsApp Business account not linked to booking system
     - No LINE ID on homepage (critical for Thai audience)
     - No chatbot for after-hours international inquiries

3. **Consultation Booking** (Icon: 📋)
   - Status: "Manual Process"
   - Description: "Free consultation form exists but no stated response SLA. Manual intake requires staff review."
   - Gaps:
     - No instant booking confirmation (patients wait for staff callback)
     - International patients face timezone delays
     - No service line routing (all inquiries hit same inbox)
     - No pre-qualification questions

4. **Appointment Confirmation** (Icon: 📅)
   - Status: "Critical Gap"
   - Description: "No automated confirmations, reminders, or rescheduling. Manual SMS/email only."
   - Gaps:
     - No appointment confirmation system detected
     - No automated reminders (estimated 22% no-show rate)
     - No self-service rescheduling
     - No pre-visit checklist

5. **Post-Visit Follow-Up** (Icon: ⭐)
   - Status: "Partial"
   - Description: "No automated review request sequence detected. Follow-ups are ad-hoc."
   - Gaps:
     - No automated post-visit survey or review nudge
     - No follow-up appointment reminder sequence
     - No patient education content sent post-visit
     - Review response lag: 18-25 days average (industry: 3-5 days)

**Timeline Styling**:
- Vertical timeline with connector line (position: absolute)
- Grid: 120px sidebar + 1fr content area
- Stage icon + title in sidebar
- Content in white card with border-left
- Connector line: 2px solid #e2e8f0 from stage to stage (hidden on mobile)
- Margin-bottom: 48px per stage

---

#### TAB 2: REVIEW ANALYTICS
**Section Heading**: "Review & Reputation Analysis"
**Section Description**: "Public review data aggregated from Google, Facebook, and local Thai health platforms."

**4 Review Stats Grid**:
- Grid: `repeat(auto-fit, minmax(240px, 1fr))`
- Each stat:
  - Number: 32px, font-weight 800, color #6366f1
  - Label: 12px, uppercase, letter-spaced, color #64748b
  - Card: Linear gradient background, border-radius 12px, padding 24px, text-align center

**Stats to Display**:
1. **Overall Rating**: 4.3★
2. **Review Velocity**: +18/mo
3. **Positive Sentiment**: 67%
4. **Response Rate**: 12%

**Key Themes Section** (below stats):
- Background: #f8fafc, border-radius 12px, padding 24px
- Heading: "Key Themes in Reviews"
- Two-column grid:
  - **✓ Praised**: "Professional staff, clean facilities, good English speakers, fast treatments"
  - **✗ Criticized**: "Slow response to inquiries, unclear pricing upfront, no online booking, follow-up gaps"

---

#### TAB 3: AI OPPORTUNITIES (21-Day Wins)
**Section Heading**: "AI Automation Opportunities (21-Day Wins)"
**Section Description**: "Ranked by implementation speed and impact. All opportunities can be activated within 21 days."

**Opportunity Cards Grid**:
- Grid: `repeat(auto-fit, minmax(220px, 1fr))`
- Gap: 20px
- 6 cards total

**Each Opportunity Card**:
- Background: White
- Border-radius: 12px
- Border-top: 3px solid #6366f1
- Padding: 24px
- Icon: 28px
- Title: 14px, font-weight 700
- Detail: 13px, color #64748b

**6 Opportunities** (in priority order):
1. **Live Chat + WhatsApp Bot** (💬)
   - Detail: "Response time: 24h → 2 min. Impact: Captures 34% of abandoning visitors."

2. **Instant Booking Confirmation** (📅)
   - Detail: "No-show rate: 22% → 8%. Appointment form + calendar sync + SMS confirm."

3. **Auto Review Request Sequence** (⭐)
   - Detail: "Review velocity: 18 days → 3 days. Post-visit automation + multi-channel (Google, FB, Thai platforms)."

4. **Service Line Routing** (🎯)
   - Detail: "Inquiries auto-routed to correct department. Reduces intake time by 40%."

5. **Patient Education Email Sequence** (📧)
   - Detail: "Post-visit care instructions + cross-sell opportunities. Reduces follow-up call volume."

6. **Multilingual FAQ Bot** (🌐)
   - Detail: "Thai, English, Mandarin, Korean. Handles 60% of repeating questions without staff."

---

#### TAB 4: SERVICE LINE BREAKDOWN
**Section Heading**: "Service Line Performance Breakdown"
**Section Description**: "Each service line shows distinct automation opportunities based on patient acquisition patterns."

**3 Service Line Cards** (left-to-right):
- Grid: `repeat(auto-fit, minmax(280px, 1fr))`
- Background: #f8fafc
- Border-radius: 12px
- Padding: 24px
- Border-left: 4px solid [color per line]

**Service Line 1: Medical Consultations** (Border: #3b82f6 Blue)
- Patient Mix: "International patients (50%), local walk-ins (50%)"
- Top Gap: "Timezone delays for US/EU inquiries. Chatbot in English + auto-translator for Thai locals."

**Service Line 2: Beauty & Wellness** (Border: #ec4899 Pink)
- Offerings: "Laser, skin treatments, IV therapy, massage"
- Top Gap: "No package/pricing transparency online. AI-driven product recommender + instant pricing quotes."

**Service Line 3: Health Coaching** (Border: #10b981 Green)
- Offerings: "Nutrition, fitness, preventive health programs"
- Top Gap: "No automated follow-up between sessions. SMS coaching + app notifications + progress tracking."

---

## DATA SPECIFICATIONS

### Clinic Information (Generic, Fictional)
- **Clinic Name**: "Bangkok Integrated Health Center"
- **Location**: "Bangkok, Thailand"
- **Service Lines**: Medical Consultations, Beauty & Wellness, Health Coaching (+ implied general medical services)
- **Patient Demographics**: International + Local, Medical Tourism focus

### Sample Metrics
**Financial**:
- Revenue Friction Gap: ฿2.1M annually
- Conservative 12-month ROI: ฿7.8M (Range: 6.2M–10.5M)

**Performance**:
- Overall Rating: 4.3★ out of 5
- Audit Score: 7.8/10
- Review Velocity: +18/month currently, target 3-5 days
- Inquiry Response Time: Currently 6-24h, target <2 minutes
- Booking Conversion: 28-37% range (trending up)
- No-show Rate: Estimated 22% (target 8% post-automation)
- Review Response Rate: 12%
- Positive Sentiment: 67%

**Chart Data** (12 months Jun-May):
- Avg Rating: [41, 42, 40, 41, 42, 43, 42, 41, 42, 43, 42, 43]
- Review Volume: [12, 15, 14, 18, 16, 19, 20, 18, 21, 19, 22, 18]
- Response Time: [18, 16, 19, 17, 20, 18, 21, 19, 22, 20, 24, 18]
- Booking Conversion: [28, 30, 27, 32, 29, 34, 31, 35, 32, 36, 33, 37]

---

## TECHNICAL SPECIFICATIONS

### Technologies
- **HTML5**: Semantic markup, accessibility (ARIA labels where relevant)
- **CSS3**: Grid, Flexbox, Gradients, Animations (transform, opacity)
- **JavaScript**: 
  - Chart.js 4.5.0 for multi-axis line chart
  - Tab switching functionality (click events)
  - No external dependencies beyond Chart.js
- **Responsive Design**: Mobile-first, breakpoint at 768px

### Performance Requirements
- Self-contained single HTML file (no external CSS/JS except Chart.js from CDN)
- Loads in <2 seconds on 4G
- Lighthouse score: >85 performance
- Mobile-friendly (100% viewport width)

### Browser Support
- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile: iOS Safari 12+, Chrome Android 70+

---

## TONE & MESSAGING GUIDELINES

### DO:
✓ Use specific numbers and percentages ("18-25 days", "22% no-show rate")
✓ Reference "public data analysis" (not "we looked at your website")
✓ Use diagnostic language ("friction points", "leakage", "gaps")
✓ Highlight before/after improvements ("24h → 2 minutes")
✓ Mention Thai-specific context (WhatsApp, LINE, medical tourism)
✓ Be clinical and data-driven
✓ Include conservative ROI ranges

### DON'T:
✗ Use marketing buzzwords ("revolutionary", "game-changing", "amazing")
✗ Make promises ("guaranteed", "will triple your revenue")
✗ Use jargon without explanation
✗ Include client logos, real names, or identifiable info
✗ Make emotional appeals
✗ Oversimplify complex processes

### Examples of Good Copy:
- "No live chat widget on website detected — creates 6-24 hour response lag for urgent inquiries"
- "Estimated 22% no-show rate. Industry benchmark: 8%. Automated SMS reminders reduce friction by 14 percentage points."
- "International patients from US/EU face timezone delays. Chatbot with auto-translation for Thai + English eliminates wait."

---

## PERSONALIZATION FOR REUSE

To adapt this report for other clinics, follow this template:

**Step 1: Update Header**
- Clinic Name: [New clinic name]
- Location: [City, Thailand]
- Audit Score: [X.X/10, keep between 7.0-8.5 for realism]
- Rating: [X.X★ out of 5, keep between 4.0-4.6]
- Service Lines: [Adjust based on clinic type]
  - Medical Clinic → Medical Consultations, Preventive Care, Lab Services
  - Beauty Salon → Hair, Skincare, Makeup, Wellness
  - Wellness Center → Yoga, Massage, Nutrition, Mental Health

**Step 2: Adjust KPIs**
- Revenue Friction Gap: ฿1.8M - 3.2M (scale to clinic size)
- ROI: Adjust based on revenue gap (multiply by 3.7x as conservative factor)
- Response Time: Keep 6-24h currently, <2 min target
- No-show Rate: 18-26% currently, 6-10% target

**Step 3: Customize Patient Journey Gaps**
- Stage 1 (Discovery): Adjust keywords to service line
- Stage 2 (First Contact): Keep WhatsApp/LINE core, adjust communication channels
- Stage 3-5: Keep structure, adjust service-specific language

**Step 4: Adjust Review Analytics**
- Keep overall rating 4.0-4.6 range
- Keep positive sentiment 65-75% range
- Adjust review volume based on clinic size (±10%)

**Step 5: Service Line Breakdown**
- Always keep 3 lines (can be: Medical/Beauty/Wellness, or Dental/Cosmetic/Implants, etc.)
- Match to clinic's actual services
- Keep Top Gap format consistent but service-specific

---

## DELIVERABLE CHECKLIST

✓ Single HTML file, self-contained (no external CSS file)
✓ Chart.js 4.5.0 loaded from CDN
✓ Header section with clinic info + audit score + rating
✓ 12-month trend chart with 4 datasets
✓ 4 KPI cards with icons and details
✓ 4 tabbed sections (Patient Journey, Reviews, Opportunities, Service Lines)
✓ Patient Journey: 5 stages with status badges and gap lists
✓ Review Analytics: 4 stats + key themes breakdown
✓ Opportunities: 6 actionable improvements, 21-day focus
✓ Service Lines: 3 lines with top gaps per line
✓ Responsive design: Works on mobile (< 768px), tablet, desktop
✓ Professional color palette, proper spacing, readable typography
✓ No real data exposure (all fictional/anonymous)
✓ Thai-friendly content (mentions WhatsApp, LINE, medical tourism context)
✓ Tone: Clinical, data-driven, professional
✓ Links/CTAs to "View Full Report" or "Request Your Audit" (can be empty href for sample)

---

## USAGE CONTEXT

**Where This Lives**: Homepage → "Our Capabilities" section or "Case Studies" page
**Primary Goal**: Demonstrate depth of analysis without requiring user login
**Secondary Goal**: Build confidence in Operato's ability to handle clinic-specific analysis
**CTA Pattern**: "This is a sample audit for a generic clinic in Bangkok. Request your personalized report →"

---

## FUTURE ENHANCEMENTS (Nice-to-Have)

- [ ] Interactive PDF export of report
- [ ] Data parameterization (pass clinic type as URL param to auto-adjust copy)
- [ ] Comparison view (audit sample vs real audit)
- [ ] Video walkthrough explaining each section
- [ ] Downloadable full report (20+ pages with appendices)
- [ ] Real-time data connection to Operato backend (for actual client audits)
- [ ] Multilingual support (Thai, Mandarin, Korean in addition to English)

---

## VERSION HISTORY

**v1.0** (May 2026): Initial release with 4 tab sections, Chart.js integration, responsive design.

**END OF PROMPT**
