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

/**
 * Rhythm: light and dark alternate, never two dark in a row.
 * Full-bleed: hero, about, modules, pilot. Rounded: two light (product, why) and two dark (pricing, closing).
 */
export default function HomePage() {
  return (
    <SmoothScroll>
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
