---
name: testing-bakery-website
description: Test the La Petite Macaron bakery website end-to-end. Use when verifying UI changes to the static HTML/CSS site.
---

# Testing the Bakery Website

## Overview
This is a pure static HTML/CSS site (no build step, no backend). Pages: `index.html` (About Us), `menu.html`, `prices.html`, `contact.html`. Shared styles in `style.css`.

## Deployment
- Deploy using the `deploy frontend` tool pointing at the repo root
- All pages are served from the deployed URL (e.g. `https://macaron-bakery-*.devinapps.com`)
- No credentials or environment variables needed

## Key Test Flows

### 1. Navigation
- Click each nav link (About Us, Menu, Our Prices, Contact Us) and verify the correct page loads
- Check the hero heading text on each page:
  - index.html: "Handcrafted Parisian Macarons"
  - menu.html: "Our Macaron Menu"
  - prices.html: "Our Prices"
  - contact.html: "Contact Us"

### 2. Menu Content
- Classic Flavors: 6 cards (Rose, Vanilla Bean, Dark Chocolate, Pistachio, Lemon, Café au Lait)
- Fruity & Seasonal: 4 cards (Strawberry, Peach Bellini, Lavender Blueberry, Mango Passion Fruit)
- Premium & Specialty: 4 cards (Salted Caramel, Matcha, Coconut & Lime, Cherry Blossom)
- Total: 14 flavor cards

### 3. Pricing
- Box tiers: Petite ($12/6), Classic ($22/12, featured), Grand ($40/24)
- Custom tiers: Simple Custom ($3/pc), Decorated ($4.50/pc), Luxury Bespoke ($6.50/pc)
- Bulk table: 4 rows (50-99, 100-199, 200-499, 500+)

### 4. Contact Form
- Fill Name, Email, and Message fields
- Click "Send Message"
- **Known quirk:** The form uses a JS `alert()` on submit which may block browser automation tools. The alert text should contain "Thank you". You might need to handle the alert dialog explicitly.

### 5. Visual Theme
- Verify pink color palette (light pink gradients, pink headings, gold accents)
- Dark charcoal footer with pink text/links
- Playfair Display serif font for headings

## No CI
This repo has no CI configured. Testing is purely visual/functional.

## Devin Secrets Needed
None — this is a public static site with no authentication.
