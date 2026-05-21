# Community Posts — 20 mayo 2026

## PRODUCT HUNT

https://www.producthunt.com/posts/gemini-omni-4

Video editing through natural language is something every YouTube creator I talk to asks for. The gap today isn't generating video — it's editing existing footage without spending 3 hours in Premiere Pro. If I could tell an AI "cut this 20-minute video to the best 8 minutes and add captions," that alone would save creators 5+ hours per week.

The object tracking across frames and physics-aware generation sound promising for B-roll generation too. Right now most creators use generic stock footage because creating custom visuals is too expensive. How does Omni handle consistency when you're making multiple edits to the same project — does it maintain a "memory" of previous changes or does each prompt start fresh?

---

https://www.producthunt.com/posts/re_gent

This solves a real pain point. I run 15+ automated agents in production and the worst debugging scenario is "something changed overnight and I don't know which agent did it." Right now my workaround is JSON audit trails per agent, but tracing a bad outcome back to the specific prompt that caused it is still manual detective work.

The multi-file rollback across sessions is the killer feature. Agent mistakes rarely touch just one file — they cascade. Does Re_gent handle rollbacks in systems where Agent A's output feeds into Agent B's input? That chain reaction is where most agent damage happens in my experience.

---

https://www.producthunt.com/posts/retina-2

I've recorded dozens of product demos and the post-production always takes 5x longer than the actual recording. Auto-zoom into the area of activity is the one feature that would save the most time — manually adding zoom keyframes in DaVinci Resolve is the most tedious part of any tutorial video.

The "cinematic out of the box, no post-production" claim is bold but that's exactly what the market needs. Screen recordings are the most common video type for SaaS demos and tutorials, yet they look amateurish 90% of the time. A tool that produces something polished enough for a Product Hunt launch video or YouTube tutorial without touching a video editor would be incredibly valuable. No watermark in beta is a smart move.

---

https://www.producthunt.com/posts/layerproof-social-content-generation

"People who think deeply but freeze at the blank page" — that's a perfect description of most indie founders I know. The blank page problem isn't about lacking ideas, it's about the gap between having a nuanced thought and turning it into something structured enough to publish.

The voice-matching angle is what separates this from generic AI writers. I've tested most AI writing tools and the output always reads like AI — technically correct but missing the specific references, opinions, and conversational quirks that make writing feel human. Does Kraft learn from your published content, or do you manually describe your style? The difference is huge — one captures what you actually write, the other captures what you think you sound like.

---

https://www.producthunt.com/posts/storeclaw

Using Claude for core intelligence, ChatGPT for intent, and Gemini for visual generation is an interesting multi-model architecture. Most AI products pick one provider and live with its limitations. The tradeoff is complexity — how do you handle latency when a single user query needs to hit three different models?

The "proactive suggestions it can execute on your behalf" approach with approval gates is the right pattern. I build automated agents and the biggest trust-builder is showing the user exactly what you're about to do before doing it. Pure autonomy sounds cool but nobody wants an AI agent repricing their entire inventory without asking first. How granular are the approval controls — can merchants set rules like "auto-execute anything under $X impact but ask for everything else"?

---

## INDIE HACKERS

https://www.indiehackers.com/post/show-ih-i-built-a-free-thumbnail-maker-for-youtubers-and-gamers-launched-3-weeks-ago-heres-what-i-learned-d13e697e30

Getting traffic from ChatGPT and Perplexity before Google is the most 2026 thing I've read this week. We're seeing the same pattern — AI referrals showing up in analytics before organic search kicks in. The old playbook of "publish, wait for Google to crawl, wait for rankings" is being disrupted by LLMs that cite tools immediately when someone asks "what's a good free thumbnail maker."

42 indexed pages in 3 weeks on a new domain is solid. A tip that worked for us: submit each new URL manually through Search Console's URL Inspection tool, don't just rely on the sitemap. Google crawls manually-submitted URLs within hours instead of weeks for new domains.

The gaming template niche is smart — super specific search intent with less competition. "CS2 thumbnail template" has far fewer competitors than "YouTube thumbnail maker." Are you tracking which templates get the most downloads? That data would tell you exactly which niches to double down on for your paid tier.

---

https://www.indiehackers.com/post/building-something-for-months-without-talking-about-it-publicly-is-weird-e999080bb4

The tension between "ship fast" and "ship polished" is real and there's no universal answer. I built 14 tools before launching publicly and I'm glad I waited — the first 5 were embarrassingly bad and would have killed trust before I had any to spend.

But here's the nuance the comments are missing: you can build in private AND validate in public simultaneously. We posted in niche communities asking about specific pain points without mentioning our product. "Do you manually check your YouTube SEO or use a tool?" taught us more than any landing page test would have. By launch day, we already knew which features to lead with because real people told us what they actually struggled with.

The "presentation and trust matter more than features" insight is spot on. First impressions are permanent on the internet. A polished MVP with 3 features beats a rough MVP with 10 every time because the rough one gets dismissed as "another half-baked thing" and that user never comes back.

---

https://www.indiehackers.com/post/we-could-see-our-ai-bill-but-not-explain-it-so-i-built-aikey-2255805e2b

Request-level cost attribution is something every team running AI in production needs and almost nobody has. We run multiple AI agents daily (content generation, security auditing, SEO analysis, competitive intelligence) and our biggest cost surprise was discovering that retry storms during API timeouts were burning 3x the tokens we expected. A single flaky connection would trigger 5 retries, each sending the full conversation history.

The three cost drivers you identified — duplicate calls, context bloat, and retry storms — are exactly right. We solved retry storms with a circuit breaker pattern (stop retrying after N consecutive failures) and context bloat by aggressively pruning conversation history. But we built all of this manually because nothing off-the-shelf existed.

The branding question in the comments is interesting. "Key management" undersells what you're building. If you can show a team that Agent X is costing $400/month because it's sending 12KB of context per request when 2KB would suffice, that's not cost monitoring — that's AI architecture consulting delivered as a dashboard.

---

https://www.indiehackers.com/post/tech/dropping-everything-to-seize-a-7-figure-arr-opportunity-g0tOSDReKQ8UqHnVt86T

"Products don't grow — distribution systems do" is the most important lesson here and the one most builders ignore. I spent months perfecting features that didn't matter because I had zero distribution. The moment I started treating distribution as the product (automated outreach, community engagement, content that brings people back) everything changed.

The template marketplace validation approach is genius — testing demand with manual templates instead of building a polished marketplace first. We did something similar: before building our AI-powered tools, we manually helped 20 YouTube creators optimize their content for free. That taught us which problems were real (SEO scoring, title testing) and which were imagined (AI script generation — turns out creators don't want AI writing for them).

15-20% monthly growth while bootstrapped in India competing against Airtable is remarkable. The capital efficiency point resonates — we run our entire AI infrastructure for under $10/month by being surgical about which tasks actually need AI and which can run on simple heuristics.
