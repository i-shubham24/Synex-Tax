import type { Metadata } from 'next';
import { SmoothScroll } from '../components/landing/SmoothScroll';
import { SiteNav } from '../components/landing/SiteNav';
import { LandingHero } from '../components/landing/LandingHero';
import { ProductGlance } from '../components/landing/ProductGlance';
import { AboutStairs } from '../components/landing/AboutStairs';
import { ModulesAccordion } from '../components/landing/ModulesAccordion';
import { WhySwitch } from '../components/landing/WhySwitch';
import { PilotProof } from '../components/landing/PilotProof';
import { PlansStairs } from '../components/landing/PlansStairs';
import { ClosingCta } from '../components/landing/ClosingFooter';
import { LandingFooter } from '../components/landing/LandingFooter';
import { JsonLd } from '../components/seo/JsonLd';
import { buildPageMetadata, SEO_PAGES } from '../seo/meta';
import { buildBreadcrumbSchema, buildHomeSchema } from '../seo/schema';

export const metadata: Metadata = buildPageMetadata(SEO_PAGES.home);

/**
 * Rhythm: light and dark alternate, never two dark in a row.
 * Full-bleed: hero, about, modules, pilot. Rounded: two light (product, why) and two dark (pricing, closing).
 */
export default function HomePage() {
  return (
    <SmoothScroll>
      <JsonLd data={[buildHomeSchema(), buildBreadcrumbSchema([])]} />
      <SiteNav />
      <main className="bg-white">
        <LandingHero /> {/* light, full-bleed */}
        <AboutStairs /> {/* dark, full-bleed */}
        <ProductGlance /> {/* light, rounded */}
        <ModulesAccordion /> {/* dark, full-bleed */}
        <WhySwitch /> {/* light, rounded */}
        <PlansStairs /> {/* dark, rounded */}
        <PilotProof /> {/* light, full-bleed */}
        <ClosingCta /> {/* dark, rounded */}
      </main>
      <LandingFooter /> {/* light */}
    </SmoothScroll>
  );
}
