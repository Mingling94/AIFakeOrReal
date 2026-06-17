import { describe, expect, it } from "vitest";
import { scanText } from "./local-scanner";

describe("scanText", () => {
  it("returns low score for short text", () => {
    expect(scanText("Too short.").score).toBeLessThan(0.2);
  });

  it("returns 0 for empty text with no comments", () => {
    expect(scanText("").score).toBe(0);
  });

  it("scores low for plain human writing", () => {
    const text =
      "I went to the store yesterday and picked up some groceries. " +
      "The weather was nice so I walked instead of driving. " +
      "My dog was happy to see me when I got home. " +
      "We played fetch in the yard for a while.";
    const result = scanText(text);
    expect(result.score).toBeLessThan(0.3);
    expect(result.vocabTriggered).toBe(false);
  });

  it("scores high for AI-heavy vocabulary", () => {
    const text =
      "We must delve into leveraging our holistic and comprehensive approach " +
      "to facilitate seamless transformation. This groundbreaking endeavor will " +
      "empower stakeholders to harness the full potential of our multifaceted " +
      "ecosystem and cultivate meaningful synergy.";
    const result = scanText(text);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.vocabTriggered).toBe(true);
  });

  it("detects phrase patterns", () => {
    const text =
      "In today's fast-paced world, it's important to note that we must " +
      "unlock the power of our platform. Let's dive in and explore how " +
      "we can revolutionize the way we approach these challenges.";
    const result = scanText(text);
    expect(result.score).toBeGreaterThan(0.2);
  });

  it("detects comment accusations", () => {
    const text =
      "Nice sunset photo, beautiful colors and composition here. " +
      "The lighting is wonderful and I love the way the sky turned " +
      "orange and purple during the golden hour.";
    const comments = [
      "this is clearly AI generated",
      "obvious AI slop",
      "is this AI??",
    ];
    const result = scanText(text, comments);
    expect(result.accusationTriggered).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("does not trigger on benign AI mentions in comments", () => {
    const text = "Check out this cool photo I took on my hike last weekend.";
    const comments = ["I love AI and machine learning!", "Great photo!"];
    const result = scanText(text, comments);
    expect(result.accusationTriggered).toBe(false);
  });

  it("does not trigger on negated accusations", () => {
    const text = "Beautiful landscape photo from my trip.";
    const comments = ["I don't think this is AI generated"];
    const result = scanText(text, comments);
    expect(result.accusationTriggered).toBe(false);
  });

  it("detects structural tells", () => {
    const text =
      "The landscape of innovation is evolving. The framework provides " +
      "robust capabilities. The paradigm shift enables transformation. " +
      "The ecosystem fosters growth. The methodology drives results. " +
      "The infrastructure supports scalability. The platform enables " +
      "organizations to achieve their objectives efficiently. " +
      "It is important to understand that these systems are designed to " +
      "be effective, efficient, and scalable. They provide clear, concise, " +
      "and actionable insights. The approach is fast, reliable, and secure.";
    const result = scanText(text);
    expect(result.structureTriggered).toBe(true);
  });
});
