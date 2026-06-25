---
name: Vibrant People System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424754'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Quicksand
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Quicksand
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Quicksand
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Quicksand
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Quicksand
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
  body-md:
    fontFamily: Quicksand
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

The design system is built on the philosophy of **Playful Corporate**. It transforms the typically sterile environment of personnel management into an energetic, human-centric experience. The target audience includes modern HR teams and employees who value clarity, speed, and a sense of belonging.

The style leverages **Modern Minimalism** infused with **Soft Tactility**. It uses high-energy accents to guide focus and celebrate achievements (like hiring or milestone completions). The emotional response should be one of optimism and ease, moving away from "management" toward "empowerment." 

Key characteristics include:
- Heavy use of whitespace to ensure the vibrant colors don't overwhelm.
- Soft, layered depth to make the interface feel tangible.
- Friendly, accessible interactions that prioritize clarity over complexity.

## Colors

The palette is designed to be high-energy yet functional.
- **Electric Blue (Primary):** Used for primary actions, navigation states, and core branding. It represents trust and modern technology.
- **Success Green (Secondary):** Reserved for positive growth metrics, status indicators, and "Completed" states.
- **Sun Orange (Tertiary):** Used for attention-grabbing elements, warnings, or highlighting "In Progress" activities.
- **Soft White (Background):** A slightly tinted neutral background (#f8fafc) reduces eye strain compared to pure white and allows the white cards to "pop" via soft shadows.

## Typography

This design system utilizes **Quicksand** as its primary typeface to evoke friendliness and warmth through its rounded terminals. For technical data and smaller labels, **Plus Jakarta Sans** is introduced to maintain legibility and a professional edge without sacrificing the modern aesthetic.

- **Headlines:** Always Bold (700) or Semi-Bold (600) to create a clear hierarchy against the soft UI.
- **Body:** Medium weights (400-500) are preferred to ensure the rounded letters remain readable at smaller scales.
- **Letter Spacing:** Headlines use slight negative tracking for a punchier, more "designed" look.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a 12-column structure for desktop. 
- **Margins:** 24px (Mobile), 40px (Tablet), 64px (Desktop).
- **Rhythm:** A strict 8px baseline grid ensures vertical consistency.
- **Padding:** High internal padding within cards (minimum 24px) creates an "airy" and approachable feel. 

On mobile, the layout reflows into a single column with cards occupying the full width minus the 24px side margins.

## Elevation & Depth

To achieve the "App-like" feel, this design system avoids harsh borders in favor of **Ambient Shadows** and **Tonal Layering**.

- **Level 0 (Surface):** The background color (#f8fafc).
- **Level 1 (Cards/Base):** Pure white (#ffffff) with a very soft, diffused shadow (15% opacity primary color tint, 20px blur, 4px Y-offset).
- **Level 2 (Interactive/Floating):** Higher elevation for elements like active modals or hovered buttons, using a more pronounced shadow.
- **Level 3 (Overlays):** Used for dropdowns and tooltips, utilizing a 16px backdrop blur (glassmorphism) to maintain context.

## Shapes

The shape language is defined by **Extreme Roundedness**.
- **Cards & Containers:** Use `rounded-xl` (1.5rem / 24px) to emphasize the soft, friendly nature of the app.
- **Buttons & Inputs:** Use "Pill-shaped" (Full) rounding to create a playful, tactile feel that encourages interaction.
- **Visual Continuity:** Small elements like checkboxes and avatars should never have sharp corners; even secondary icons should utilize a minimum 4px corner radius.

## Components

### Buttons
Primary buttons use a subtle vertical gradient of the Electric Blue and a pill-shape. Secondary buttons are "ghost" style with a 2px colored border. 

### Chips / Tags
Used extensively for employee status (e.g., "Remote," "Full-time"). These use a low-opacity background of the accent color (10%) with high-contrast text for maximum readability and a "gem-like" appearance.

### Cards
Cards are the primary container. They must have a white background, no border, and the Level 1 shadow. Headers within cards should use the Sun Orange or Success Green for icons to add energy.

### Inputs
Search bars and form fields use a light gray background (#f1f5f9) in their rest state and transition to a 2px Electric Blue border on focus.

### Additional Components
- **Progress Rings:** Large, thick-stroke rings using the Success Green for goal tracking.
- **Avatars:** Always circular with a 2px white border and a soft shadow to stand out against colored backgrounds.
- **Success Modals:** Use full-bleed Sun Orange or Success Green headers to celebrate milestones.