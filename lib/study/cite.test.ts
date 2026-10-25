import { expect, it } from "vitest";
import { linkCitations } from "@/components/Markdown";

it("turns section citations into chip links", () => {
  expect(linkCitations("ATP is made here [§3].")).toBe("ATP is made here [§3](#cite-3).");
  expect(linkCitations("Both [§3, §12]")).toBe("Both [§3](#cite-3) [§12](#cite-12)");
  expect(linkCitations("[link](http://x) [not a cite]")).toBe("[link](http://x) [not a cite]");
});
