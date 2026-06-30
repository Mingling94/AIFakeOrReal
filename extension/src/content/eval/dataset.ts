// Labeled evaluation corpus for the local heuristic scanner.
//
// This is a small, hand-built benchmark — NOT a training set. Its job is to let
// us measure precision/recall of `scanText` and pick badge/avoidance thresholds
// that protect against false positives (flagging real human writing as AI).
//
// Human samples deliberately include "AI-bait" — professional/marketing prose,
// em-dashes, and a few buzzwords — because those are exactly what the heuristic
// over-flags. AI samples include both obvious ChatGPT-style text and a few
// "clean" ones to honestly expose the heuristic's recall ceiling.

export interface Sample {
  text: string;
  comments?: string[];
  label: "human" | "ai";
  note?: string;
}

export const DATASET: Sample[] = [
  // ---------------- HUMAN ----------------
  {
    label: "human",
    note: "casual reddit",
    text: "honestly I tried this recipe last night and it was kind of a disaster lol. the sauce never thickened and I ended up just dumping extra cheese on it. still ate the whole thing though, no regrets. anyone know what I did wrong? I followed it pretty much exactly except I used milk instead of cream.",
  },
  {
    label: "human",
    note: "personal blog",
    text: "We got to the trailhead way too late, like 11am, and the parking lot was already packed. My knee started acting up around mile four so we turned back before the summit. Bit of a bummer but the wildflowers were unreal this year. Gonna try again next weekend if the weather holds.",
  },
  {
    label: "human",
    note: "news lede",
    text: "City council voted 6-3 on Tuesday to approve the new zoning plan after nearly four hours of public comment. Opponents argued the changes would push out longtime residents, while supporters said the city desperately needs more housing. The plan takes effect in January.",
  },
  {
    label: "human",
    note: "marketing copy (bait: buzzwords)",
    text: "Our team is passionate about helping small businesses grow. We build simple tools that save you time so you can focus on what matters. No jargon, no lock-in, just software that works. Try it free for 14 days and tell us what you think.",
  },
  {
    label: "human",
    note: "human op-ed with em-dashes (bait)",
    text: "I've changed my mind about remote work — slowly, and against my own stubbornness. For two years I swore the office was dead. Now I think we threw out something real: the hallway conversations, the overheard problems, the friend you make by accident. Maybe the answer was never all-or-nothing.",
  },
  {
    label: "human",
    note: "tweet-style",
    text: "the absolute state of airport wifi in 2026. paid eight dollars to load a single boarding pass and it still timed out twice. we can put a robot on mars but we can't get a webpage to load at gate 34",
  },
  {
    label: "human",
    note: "product review",
    text: "Bought these for my dad who has trouble gripping small things. The handles are chunky and the grip is solid. One of them arrived with a scratch but customer service sent a replacement no questions asked. Would buy again. Knocking off a star because the lid is a pain to clean.",
  },
  {
    label: "human",
    note: "forum technical",
    text: "Ran into the same issue on Ubuntu 24.04. Turns out the driver wasn't loading because secure boot was blocking the unsigned module. Disabled it in BIOS and everything came back. If you don't want to disable secure boot you can sign the module yourself but it's a pain.",
  },
  {
    label: "human",
    note: "wikipedia-ish (bait: formal)",
    text: "The river rises in the western highlands and flows roughly 300 kilometres before reaching the sea. Historically it served as a trade route, and several medieval towns grew along its banks. Today much of the upper valley is protected parkland, though pollution from upstream agriculture remains a concern.",
  },
  {
    label: "human",
    note: "short post",
    text: "just adopted the goofiest little cat and she will not stop knocking pens off my desk. send help (do not actually send help she is perfect)",
  },
  {
    label: "human",
    note: "recipe instructions",
    text: "Preheat the oven to 220 degrees. Toss the potatoes with oil, salt, and a bit of paprika. Roast for 25 minutes, flip them, then roast another 20 until the edges are crispy. Don't crowd the pan or they'll steam instead of brown. Serve with the garlic yogurt.",
  },
  {
    label: "human",
    note: "emotional personal",
    text: "Lost my grandfather last month. He taught me to fish and never once let me win at cards. I keep reaching for my phone to text him something dumb and then remembering. Grief is weird like that. Anyway, hug your people. That's all I've got today.",
  },
  {
    label: "human",
    note: "sports recap",
    text: "What a finish. Down by two with thirty seconds left and the rookie just calmly drains a three like it's practice. The whole arena lost it. Defense was shaky all night but who cares, they found a way. Playoffs here we come, finally.",
  },
  {
    label: "human",
    note: "academic abstract (bait)",
    text: "This study examines the relationship between sleep duration and working memory in adolescents. Using data from 1,200 participants, we found a modest but significant correlation. Our results suggest that even small reductions in sleep are associated with measurable declines in task performance, though causality cannot be established from observational data alone.",
  },
  {
    label: "human",
    note: "complaint",
    text: "Third time this month the delivery just got marked as completed and nothing showed up. Spent forty minutes on chat support who told me to wait another five business days. I've been a customer for six years. At this point I'm genuinely considering switching even though it's a hassle.",
  },
  {
    label: "human",
    note: "how-to casual",
    text: "ok so the trick with sourdough is you have to stop babying the starter. feed it, leave it alone, trust the process. I killed like three before I figured out my kitchen was just too cold. stuck it on top of the fridge and boom, bubbles everywhere.",
  },
  {
    label: "human",
    note: "history snippet",
    text: "By the late 1800s the factory employed nearly two thousand workers, most of them women and children. Conditions were brutal and pay was low. A strike in 1894 shut the place down for six weeks before the owners agreed to shorter hours, a small but hard-won victory.",
  },
  {
    label: "human",
    note: "gaming",
    text: "finally beat the final boss after like thirty tries. the trick was to ignore the adds and just burst the boss during the second phase. my hands are literally shaking. ten out of ten game but that difficulty spike at the end is genuinely mean",
  },
  {
    label: "human",
    note: "professional email-ish (bait)",
    text: "Hi team, quick update on the launch. We're on track for Thursday pending final QA. I'll need sign-off from design by end of day Wednesday. If anything's blocking you, flag it now rather than tomorrow morning. Thanks for the hard push this week, almost there.",
  },
  {
    label: "human",
    note: "travel",
    text: "Lisbon completely won me over. The hills are no joke and my legs hated me, but every wrong turn led somewhere beautiful. Ate too many pastries, took the tram everywhere, got lost in Alfama for hours. Already trying to figure out when I can go back.",
  },
  {
    label: "human",
    note: "rant",
    text: "why does every app want me to make an account just to look at a menu. I am trying to order a sandwich not enter a long term relationship with your loyalty program. let me check out as a guest you cowards",
  },
  {
    label: "human",
    note: "thoughtful comment",
    text: "I think people underestimate how much luck plays into success. Hard work matters, sure, but so does being born in the right decade, knowing the right person, not getting sick at the wrong time. Doesn't mean effort is pointless, just that a little humility goes a long way.",
  },

  // ---------------- AI ----------------
  {
    label: "ai",
    note: "classic chatgpt tells",
    text: "In today's fast-paced world, it's important to note that leveraging the right tools can be a game-changer. Let's dive in and explore the multifaceted, transformative ways AI empowers us to streamline our workflows. By harnessing these comprehensive solutions, we can unlock the full potential of our productivity and foster a more holistic approach to success.",
  },
  {
    label: "ai",
    note: "listicle intro",
    text: "Embarking on a journey toward better health is a deeply personal and transformative endeavor. Whether you're a seasoned athlete or just beginning, it's worth mentioning that small, actionable steps can yield profound results. In this comprehensive guide, we'll delve into the myriad benefits of mindful movement and underscore why consistency is paramount.",
  },
  {
    label: "ai",
    note: "assistant voice",
    text: "Great question! I'd be happy to help you understand this topic. It's important to note that there are several key factors to consider. First and foremost, you'll want to leverage a holistic approach. Additionally, it's worth mentioning that consistency is crucial. I hope this helps clarify things — let me know if you'd like me to elaborate further.",
  },
  {
    label: "ai",
    note: "marketing slop",
    text: "Unlock the power of seamless productivity with our groundbreaking, state-of-the-art platform. Our cutting-edge solution empowers teams to streamline workflows, foster collaboration, and elevate their performance to new heights. Experience a paradigm shift that revolutionizes the way you work. It's not just a tool — it's a testament to innovation.",
  },
  {
    label: "ai",
    note: "essay body, em-dashes + tricolons",
    text: "The implications are profound, far-reaching, and undeniable. As we navigate the ever-evolving landscape of modern technology, we must consider the ethical, social, and economic dimensions of these changes. It is crucial to underscore that progress — when guided by wisdom, foresight, and compassion — can illuminate a path toward a more equitable future.",
  },
  {
    label: "ai",
    note: "explainer",
    text: "Photosynthesis is a fascinating and intricate process that underscores the elegance of nature. Essentially, plants harness sunlight to convert carbon dioxide and water into glucose and oxygen. This pivotal mechanism not only sustains plant life but also plays a paramount role in maintaining the delicate balance of our ecosystem. Truly, it is a remarkable testament to biological ingenuity.",
  },
  {
    label: "ai",
    note: "advice",
    text: "Navigating the complexities of personal finance can feel overwhelming, but it doesn't have to be. By cultivating mindful spending habits and leveraging a comprehensive budgeting strategy, you can foster long-term financial wellness. Remember, the journey to financial freedom is a marathon, not a sprint. Embrace the process and celebrate every milestone along the way.",
  },
  {
    label: "ai",
    note: "review-style ai",
    text: "This product is a true game-changer that seamlessly integrates into your daily routine. Its sleek, intuitive design empowers users to elevate their experience effortlessly. Moreover, the build quality is exceptional, the performance is unparalleled, and the value is undeniable. In conclusion, it stands as a testament to thoughtful, user-centric engineering.",
  },
  {
    label: "ai",
    note: "comments accuse (image post)",
    text: "Beautiful sunset over the mountains, captured on my evening walk.",
    comments: [
      "this is clearly AI generated, look at the weird clouds",
      "yeah the lighting is totally off, midjourney vibes",
      "AI slop, the trees don't even connect to the ground",
    ],
  },
  {
    label: "ai",
    note: "intro paragraph",
    text: "In an era defined by rapid technological advancement, it is increasingly important to delve into the nuanced interplay between innovation and responsibility. This multifaceted topic demands a holistic perspective, one that underscores both the transformative potential and the inherent challenges. Let's unpack this and explore the salient considerations together.",
  },
  {
    label: "ai",
    note: "how-to ai",
    text: "Crafting the perfect cup of coffee is both an art and a science. To begin, it's essential to leverage freshly ground beans and meticulously measure your ratios. Furthermore, water temperature plays a pivotal role in extracting optimal flavor. By embracing these foundational principles, you can elevate your morning ritual into a truly transformative experience.",
  },
  {
    label: "ai",
    note: "summary ai",
    text: "Ultimately, the key takeaway is that success hinges on a delicate balance of strategy, execution, and adaptability. By fostering a growth mindset and harnessing the power of continuous improvement, individuals and organizations alike can navigate uncertainty with confidence. The bottom line is that resilience, paired with vision, paves the way for enduring impact.",
  },
  {
    label: "ai",
    note: "clean ai (hard — few tells)",
    text: "The museum opens at ten and tickets are cheaper if you book online ahead of time. The second floor has the modern collection, which most people skip but I think is the best part. Give yourself about two hours. There's a small cafe near the entrance if you need a break partway through.",
  },
  {
    label: "ai",
    note: "clean ai short-ish (hard)",
    text: "Regular exercise offers a wide range of benefits for both body and mind. It can improve cardiovascular health, strengthen muscles, and boost mood through the release of endorphins. Even moderate activity, like a daily walk, can make a meaningful difference over time. The important thing is to find something you enjoy and stick with it.",
  },
];
