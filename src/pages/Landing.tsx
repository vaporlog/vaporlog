import Hero from "@/components/landing/Hero";
import ProductShowcase from "@/components/landing/ProductShowcase";
import Problem from "@/components/landing/Problem";
import HowItWorks from "@/components/landing/HowItWorks";
import Comparison from "@/components/landing/Comparison";
import CommunityProof from "@/components/landing/CommunityProof";
import Closing from "@/components/landing/Closing";
import { useStrains } from "@/lib/data";

/**
 * Landing — the viral-product showcase. One idea per screen (#6):
 *   1. Hero that sells alone (#20) with one CTA (#22, #28)
 *   2. The product, shown before it's explained (#10) — a real seed session
 *   3. Empathy: the problem described better than the user can (#21)
 *   4. How it works in 3 steps
 *   5. Comparison vs notes app / spreadsheet (#31)
 *   6. Social proof from real community sessions (#29)
 *   7. A footer people want to share (#4) + "free during early access"
 * Three colors only (#2): white, near-black, herb green for the CTA and
 * rating highlights. No pricing section — free during early access.
 */
export default function Landing() {
  // Warm the lazy strain catalog in the background (it does not block first
  // paint): the showcase/community cards swap humanized slugs for real
  // catalog names when it lands, and the catalog is cached by the time the
  // visitor reaches /log or /strains.
  useStrains();

  return (
    <>
      <Hero />
      <ProductShowcase />
      <Problem />
      <HowItWorks />
      <Comparison />
      <CommunityProof />
      <Closing />
    </>
  );
}
