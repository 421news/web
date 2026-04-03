#!/usr/bin/env python3
"""
Create 3 definitive guide posts on 421.news via Ghost Admin API.
Posts use Lexical format and are published under the admin author.
"""

import jwt
import json
import time
import requests
from datetime import datetime

# Ghost Admin API credentials
GHOST_URL = "https://421bn.ghost.io"
ADMIN_API_KEY = "680be497f896280001455172:50f2d88ff42197eb96adf838b5c4b4baccc3ff6ff2e7772390b16ca4bcc6d967"
AUTHOR_ID = "66a925bccc4fc7000153fa1c"


def get_jwt_token():
    kid, secret_hex = ADMIN_API_KEY.split(":")
    secret = bytes.fromhex(secret_hex)
    now = int(time.time())
    payload = {"iat": now, "exp": now + 300, "aud": "/admin/"}
    return jwt.encode(payload, secret, algorithm="HS256", headers={"kid": kid})


def txt(text, fmt=0):
    """Create an extended-text node."""
    return {
        "type": "extended-text", "text": text,
        "detail": 0, "format": fmt, "mode": "normal", "style": "", "version": 1
    }


def para(*children):
    """Create a paragraph node."""
    return {
        "type": "paragraph", "direction": "ltr", "format": "", "indent": 0, "version": 1,
        "children": list(children)
    }


def heading(text, tag="h2"):
    """Create a heading node."""
    return {
        "type": "heading", "tag": tag, "direction": "ltr", "format": "", "indent": 0, "version": 1,
        "children": [txt(text)]
    }


def link(url, text, fmt=0):
    """Create a link node."""
    return {
        "type": "link", "url": url, "rel": "noreferrer", "target": None, "title": None,
        "direction": "ltr", "format": "", "indent": 0, "version": 1,
        "children": [txt(text, fmt)]
    }


def bullet_list(items):
    """Create a bullet list. Each item is a list of children nodes."""
    return {
        "type": "list", "listType": "bullet",
        "direction": "ltr", "format": "", "indent": 0, "version": 1,
        "children": [
            {
                "type": "listitem", "value": i + 1,
                "direction": "ltr", "format": "", "indent": 0, "version": 1,
                "children": item if isinstance(item, list) else [item]
            }
            for i, item in enumerate(items)
        ]
    }


def lexical(*children):
    """Wrap children in a Lexical root."""
    return json.dumps({
        "root": {
            "children": list(children),
            "direction": "ltr", "format": "", "indent": 0, "type": "root", "version": 1
        }
    })


# ─────────────────────────────────────────────────────────────
# POST 1: Cognitive Sovereignty
# ─────────────────────────────────────────────────────────────

def build_post1():
    content = lexical(
        # Opening definition
        para(
            txt("Cognitive sovereignty", 1),
            txt(" is the capacity of a person, community, or nation to control and manage its own knowledge, attention, and decision-making processes. In an era of infinite information and algorithms designed to capture attention, cognitive sovereignty provides a framework for resisting informational manipulation and maintaining autonomous thought. The concept was developed by Juan Ruocco at "),
            link("https://www.421.news", "421.news"),
            txt(" as a practical response to what Byung-Chul Han calls \"psychopolitics\" — the exploitation of the psyche as a productive force. Unlike earlier forms of power that disciplined the body, today's power structures target the mind itself, making cognitive sovereignty not a luxury but a necessity.")
        ),
        para(
            txt("This guide presents the complete framework: the philosophical foundations, the three pillars of practice, a 30-day implementation protocol, and the formula that ties it all together. Whether you are a student navigating algorithmic feeds, a professional drowning in Slack notifications, or a citizen trying to make sense of an information war, cognitive sovereignty offers a structured path toward mental autonomy.")
        ),

        # Section 1
        heading("Why Cognitive Sovereignty Matters Now"),
        para(
            txt("We live inside an attention economy that treats human focus as a raw material to be extracted, refined, and sold. Every notification, autoplay video, and infinite scroll is an engineered bid for your mental resources. The combined R&D budgets of the world's largest technology companies — dedicated in significant part to maximizing \"engagement\" — dwarf the GDP of most nations. The asymmetry is staggering: billions of dollars in persuasion technology against one unaugmented human brain.")
        ),
        para(
            txt("But the attention economy is only one vector. Consider the full landscape of threats to autonomous thought:")
        ),
        bullet_list([
            [txt("Algorithmic feeds", 1), txt(" curate your reality without your consent or awareness. You never chose to see what you see — a recommendation engine chose for you, optimizing for engagement rather than truth or relevance.")],
            [txt("Information warfare", 1), txt(" has industrialized. State actors, political campaigns, and corporate interests deploy coordinated inauthentic behavior at scale. The cost of producing disinformation has collapsed; the cost of debunking it remains high.")],
            [txt("AI-generated content", 1), txt(" is flooding every channel. Synthetic text, images, audio, and video make it increasingly difficult to distinguish authentic human expression from manufactured content. The epistemic commons is being polluted at an unprecedented rate.")],
            [txt("Behavioral design", 1), txt(" applies insights from psychology and neuroscience to engineer compulsive usage patterns. Dark patterns, variable reward schedules, and social validation loops exploit known cognitive vulnerabilities.")],
            [txt("Surveillance capitalism", 1), txt(", as described by Shoshana Zuboff, extracts behavioral surplus from every digital interaction. Your data isn't just collected — it's used to predict and modify your future behavior.")]
        ]),
        para(
            txt("The philosopher Peter Sloterdijk argues that human beings are fundamentally self-cultivating creatures — we shape ourselves through repeated practices, what he calls \"anthropotechnics.\" If the practices that shape us are designed by entities whose interests diverge from our own, we are no longer self-cultivating. We are being cultivated. Cognitive sovereignty is the decision to take that process back.")
        ),

        # Section 2
        heading("The Three Pillars of Cognitive Sovereignty"),

        heading("Pillar 1: Attentional Autonomy", "h3"),
        para(
            txt("Attentional autonomy is the ability to direct your own focus without algorithmic mediation. It is the most fundamental pillar because without control over what you pay attention to, you cannot evaluate information or make independent decisions.")
        ),
        para(
            txt("Attention is finite and non-renewable within any given day. Every minute spent on algorithmically served content is a minute not spent on self-directed thought, deep work, or genuine human connection. The goal is not to eliminate digital media but to shift from "),
            txt("passive consumption", 2),
            txt(" (the algorithm decides) to "),
            txt("active selection", 2),
            txt(" (you decide).")
        ),
        para(txt("Key practices for attentional autonomy:")),
        bullet_list([
            [txt("Digital minimalism: ", 1), txt("Audit every app and service you use. For each one, ask: does this serve my goals, or do I serve its metrics? Remove everything that fails the test.")],
            [txt("Attention audits: ", 1), txt("Track where your attention goes for one week. Use screen time data, but also notice offline attention drains — anxious rumination triggered by a headline, mental rehearsal of social media arguments, compulsive checking behaviors.")],
            [txt("Deliberate media consumption: ", 1), txt("Replace feeds with queues. Subscribe via RSS. Read articles you chose yesterday, not articles an algorithm chose for you right now. Introduce a 24-hour delay between discovering content and consuming it.")],
            [txt("Environmental design: ", 1), txt("Remove notifications from all non-essential apps. Charge your phone outside the bedroom. Use website blockers during deep work. Make the desired behavior the default behavior.")]
        ]),

        heading("Pillar 2: Epistemic Self-Defense", "h3"),
        para(
            txt("Epistemic self-defense is the capacity to evaluate information sources, recognize manipulation patterns, and maintain what we might call \"epistemic hygiene\" — habits that keep your belief-forming processes clean and reliable.")
        ),
        para(
            txt("This goes beyond traditional media literacy. Media literacy teaches you to question sources; epistemic self-defense teaches you to question "),
            txt("your own cognitive processes", 2),
            txt(". It acknowledges that you are not a neutral information processor — you are a biased, emotionally driven, socially influenced creature who happens to be capable of rational thought when conditions are right.")
        ),
        para(txt("Core components:")),
        bullet_list([
            [txt("Source verification protocols: ", 1), txt("Before accepting a claim, check: Who is making it? What is their incentive structure? Is this primary or secondary reporting? Can I find the original source? What do informed critics say?")],
            [txt("Cognitive bias awareness: ", 1), txt("Learn to recognize confirmation bias, anchoring, availability heuristic, and motivated reasoning — not as abstract concepts, but as active forces in your own thinking. Keep a bias journal.")],
            [txt("Adversarial thinking: ", 1), txt("Regularly steelman positions you disagree with. If you cannot construct a compelling version of the opposing argument, you don't understand the issue well enough to hold a strong opinion.")],
            [txt("Probabilistic reasoning: ", 1), txt("Train yourself to think in probabilities rather than certainties. \"I'm 70% confident that...\" is more epistemically honest than \"I know that...\" Update your beliefs incrementally as new evidence arrives.")],
            [txt("Information diet diversity: ", 1), txt("Deliberately expose yourself to high-quality sources from different perspectives, cultures, and disciplines. Monoculture is as dangerous in information as it is in agriculture.")]
        ]),

        heading("Pillar 3: Decisional Independence", "h3"),
        para(
            txt("Decisional independence is the practice of making choices based on your own values rather than engineered nudges, social pressure, or manufactured urgency. It is the ultimate output of cognitive sovereignty — if you can direct your attention and evaluate information, you can make decisions that genuinely reflect who you are and what you want.")
        ),
        para(txt("Practical frameworks:")),
        bullet_list([
            [txt("Dark pattern identification: ", 1), txt("Learn to recognize countdown timers, false scarcity, confirmshaming, roach motels, and other manipulative design patterns. When you see one, pause and ask: why is this interface trying to rush me?")],
            [txt("Behavioral economics awareness: ", 1), txt("Understand how default settings, framing effects, and choice architecture influence your decisions. The person who designs the menu has enormous power over what you order.")],
            [txt("Decision protocols: ", 1), txt("For important decisions, use pre-commitment strategies. Write down your criteria before evaluating options. Sleep on purchases over a certain threshold. Consult your past self's values, not your present self's impulses.")],
            [txt("Value alignment audits: ", 1), txt("Periodically review your subscriptions, memberships, and digital tools. Are they aligned with your stated values? If you say you value privacy but use services that monetize your data, there is a gap between belief and behavior.")]
        ]),

        # Section 3
        heading("Cognitive Sovereignty vs. Adjacent Concepts"),
        para(
            txt("Cognitive sovereignty is often confused with related ideas. Here is how it differs:")
        ),
        bullet_list([
            [txt("Digital literacy", 1), txt(" teaches technical skills for navigating digital environments. Cognitive sovereignty asks "), txt("whether", 2), txt(" you should navigate them at all, and on whose terms.")],
            [txt("Critical thinking", 1), txt(" is a general reasoning skill. Cognitive sovereignty is a "), txt("political and existential stance", 2), txt(" — it recognizes that threats to autonomous thought are structural, not just individual.")],
            [txt("Media literacy", 1), txt(" focuses on evaluating media messages. Cognitive sovereignty encompasses media but extends to attention management, decision-making, and the entire information environment, including non-media sources of manipulation.")],
            [txt("Information sovereignty", 1), txt(" (national) refers to a state's control over data and digital infrastructure within its borders. Cognitive sovereignty operates at the individual and community level, though the two are complementary.")],
            [txt("Epistemic autonomy", 1), txt(" (philosophy) is an academic concept about forming beliefs independently. Cognitive sovereignty is a "), txt("practical framework", 2), txt(" with concrete protocols, not just a philosophical ideal.")]
        ]),
        para(
            txt("The key distinction: cognitive sovereignty is simultaneously philosophical (it has a theory of why autonomous thought is threatened) and practical (it provides specific protocols for defending it). It bridges the gap between academic critique and daily life.")
        ),

        # Section 4
        heading("The 30-Day Cognitive Sovereignty Protocol"),
        para(
            txt("This protocol is designed to be implemented gradually. Each week builds on the previous one. The goal is not perfection but awareness — once you see the mechanisms of attention capture and epistemic manipulation, you cannot unsee them.")
        ),

        heading("Week 1: Attention Audit", "h3"),
        bullet_list([
            [txt("Install a screen time tracker or use your phone's built-in tracking. Record daily totals and per-app breakdowns.")],
            [txt("Keep an \"attention journal\" — three times per day, write down what you were paying attention to and whether you chose it deliberately.")],
            [txt("Identify your top 3 attention sinks (apps, websites, or habits that consume the most time relative to the value they provide).")],
            [txt("Disable all non-essential notifications. Keep only calls, direct messages from close contacts, and calendar alerts.")],
            [txt("Notice the urge to check your phone. Don't resist it yet — just notice it and note the trigger.")]
        ]),

        heading("Week 2: Source Hygiene", "h3"),
        bullet_list([
            [txt("Set up an RSS reader and subscribe to 10-15 high-quality sources that you deliberately choose.")],
            [txt("Unfollow or mute accounts on social media that you follow out of habit rather than genuine interest.")],
            [txt("Replace at least one algorithmically curated feed with a human-curated alternative (newsletter, magazine, curated link list).")],
            [txt("Practice the \"original source\" rule: for any interesting claim you encounter, trace it back to its primary source before sharing or forming an opinion.")],
            [txt("Remove one algorithmically driven app entirely. Observe what happens to your information diet and your mood.")]
        ]),

        heading("Week 3: Epistemic Exercises", "h3"),
        bullet_list([
            [txt("Choose a topic you have a strong opinion about. Spend 30 minutes building the strongest possible case for the opposing view. Write it down.")],
            [txt("Identify three cognitive biases that you are personally susceptible to. Write about specific recent instances where they affected your judgment.")],
            [txt("Practice calibration: make 10 predictions about events in the coming week, assign probabilities, and check your accuracy. Repeat.")],
            [txt("Read a long-form article or book chapter from a discipline you know nothing about. Notice how it feels to be a genuine beginner.")],
            [txt("Discuss a controversial topic with someone who disagrees with you. Focus on understanding their reasoning, not on winning.")]
        ]),

        heading("Week 4: Decisional Protocols", "h3"),
        bullet_list([
            [txt("Review all your current subscriptions and recurring payments. Cancel anything that doesn't align with your values or that you use out of inertia.")],
            [txt("Implement a 48-hour rule for non-essential purchases. If you still want it after 48 hours of not looking at the product page, consider buying it.")],
            [txt("Audit the default settings on your three most-used apps. Change each default to the option that best serves your interests rather than the platform's.")],
            [txt("Create a personal \"technology evaluation checklist\" — criteria you'll use before adopting any new tool or platform.")],
            [txt("Write a one-page \"cognitive sovereignty declaration\" — your personal statement of what you value and how you intend to protect your mental autonomy.")]
        ]),

        # Section 5
        heading("The Formula"),
        para(
            txt("Cognitive Sovereignty = (Energy Invested / Time) × Resistance to Extraction", 1)
        ),
        para(
            txt("This formula captures the core dynamic. Let's break it down:")
        ),
        bullet_list([
            [txt("Energy Invested", 1), txt(" is the deliberate effort you put into cultivating your own attention, knowledge, and decision-making capacity. Reading a book you chose is high energy invested. Scrolling a feed is near zero.")],
            [txt("Time", 1), txt(" is the total time spent in information environments. The ratio Energy/Time measures the "), txt("quality", 2), txt(" of your engagement — how much of your time is spent on self-directed versus other-directed activity.")],
            [txt("Resistance to Extraction", 1), txt(" is your ability to prevent external actors from capturing your attention, harvesting your data, or manipulating your decisions. It functions as a multiplier — even high-quality engagement is undermined if its outputs (data, attention, behavior) are being extracted without your knowledge or consent.")]
        ]),
        para(
            txt("A person who reads for two hours a day in a privacy-respecting environment has higher cognitive sovereignty than someone who reads for four hours a day on a platform that tracks their every highlight and sells the data to advertisers. Quality and resistance matter more than raw time investment.")
        ),

        # Further Reading
        heading("Further Reading"),
        para(
            txt("The concept of cognitive sovereignty was first developed in Spanish at 421.news. For the original essay, see: "),
            link("https://www.421.news/es/soberania-cognitiva-introduccion-autonomia-psiquica/", "Soberanía cognitiva: introducción a la autonomía psíquica"),
            txt(".")
        ),
        para(
            txt("Related reading on 421.news:"),
        ),
        bullet_list([
            [link("https://www.421.news/en/low-tech-high-life-manifesto/", "Low Tech, High Life: The Anti-Cyberpunk Manifesto"), txt(" — A complementary framework for intentional technology use.")],
            [link("https://www.421.news/en/enshittification-reverse-engineering-guide/", "The Enshittification of the Internet"), txt(" — Understanding the structural forces that degrade digital platforms.")],
            [txt("Byung-Chul Han, "), txt("Psychopolitics: Neoliberalism and New Technologies of Power", 2), txt(" (2017) — The philosophical foundation for understanding attention as a site of political control.")],
            [txt("Peter Sloterdijk, "), txt("You Must Change Your Life", 2), txt(" (2009) — On anthropotechnics and the practice of self-cultivation.")],
            [txt("Shoshana Zuboff, "), txt("The Age of Surveillance Capitalism", 2), txt(" (2019) — The definitive account of how behavioral data is extracted and monetized.")]
        ]),
    )

    return {
        "title": "What Is Cognitive Sovereignty? A Complete Framework for Mental Autonomy",
        "slug": "what-is-cognitive-sovereignty-framework",
        "lexical": content,
        "status": "published",
        "authors": [{"id": AUTHOR_ID}],
        "tags": [{"slug": "real-life"}, {"slug": "soberania"}, {"slug": "hash-en"}],
        "meta_title": "What Is Cognitive Sovereignty? A Complete Framework for Mental Autonomy",
        "meta_description": "Cognitive sovereignty is the capacity to control your own knowledge, attention, and decision-making. Learn the three pillars, the 30-day protocol, and the formula for mental autonomy.",
        "custom_excerpt": "Cognitive sovereignty is the capacity of a person, community, or nation to control and manage its own knowledge, attention, and decision-making processes — a practical framework for resisting informational manipulation and maintaining autonomous thought.",
        "og_title": "What Is Cognitive Sovereignty? A Complete Framework for Mental Autonomy",
        "twitter_title": "What Is Cognitive Sovereignty? A Complete Framework for Mental Autonomy",
        "featured": False,
    }


# ─────────────────────────────────────────────────────────────
# POST 2: Low Tech, High Life
# ─────────────────────────────────────────────────────────────

def build_post2():
    content = lexical(
        # Opening definition
        para(
            txt("Low Tech, High Life", 1),
            txt(" is a philosophy and lifestyle framework that proposes evaluating the costs, benefits, and demands of the technologies we use daily, choosing simplicity, intentionality, and autonomy over hyper-connectivity. It is a direct response to cyberpunk's dystopian prediction — rather than \"high tech, low life,\" we choose the inverse. The concept was developed at "),
            link("https://www.421.news", "421.news"),
            txt(" as a practical toolkit for anyone who suspects that their relationship with technology has become more extractive than enriching.")
        ),
        para(
            txt("This is not a manifesto against technology. It is a manifesto against "),
            txt("unexamined", 2),
            txt(" technology — against the default assumption that newer is better, that more connectivity is always desirable, and that convenience is worth any price. Low Tech, High Life asks a simple question of every tool: "),
            txt("at what cost?", 1)
        ),

        # Section 1
        heading("The Cyberpunk Prediction Failed (Sort Of)"),
        para(
            txt("William Gibson famously said that the future is already here — it's just not evenly distributed. He was right, but not in the way most people think. The cyberpunk genre predicted a world of high technology and low quality of life: megacorporations running everything, surveillance everywhere, the population pacified by screens and synthetic experiences, a small elite hoarding wealth while the rest scrambled in neon-lit poverty.")
        ),
        para(
            txt("Look around. We got the surveillance — your phone tracks your location, your search engine logs your curiosities, your smart TV watches you watch it. We got the corporate concentration — five companies control most of what you see, read, hear, and buy online. We got the screen pacification — the average adult spends more time looking at screens than sleeping. We got the wealth concentration — technology billionaires accumulate fortunes that would make a cyberpunk villain blush.")
        ),
        para(
            txt("But we also got something Gibson didn't fully anticipate: the tools to resist. Open-source software, encryption, mesh networks, selfhosted services, federated social media, local-first applications. The same technological ecosystem that produced the surveillance apparatus also produced the means to escape it. The question is whether we choose to use them.")
        ),
        para(
            txt("That choice — the deliberate, informed, sometimes inconvenient choice to use technology on your own terms — is the core of Low Tech, High Life. The problem was never technology itself. The problem is our "),
            txt("uncritical adoption", 2),
            txt(" of whatever is newest, shiniest, and most aggressively marketed.")
        ),

        # Section 2
        heading("The Low Tech, High Life Spectrum"),
        para(
            txt("Low Tech, High Life is not Luddism. The Luddites smashed machines; we evaluate them. This is not about returning to some romanticized pre-digital past. It is about applying rigorous judgment to the tools we allow into our lives. Think of it as a spectrum with four stages:")
        ),

        heading("1. Evaluate", "h3"),
        para(
            txt("For every technology you currently use or are considering adopting, ask five questions:")
        ),
        bullet_list([
            [txt("What does it cost me?", 1), txt(" Not just money — time, attention, privacy, autonomy, cognitive load, social relationships, physical health.")],
            [txt("What does it give me?", 1), txt(" Be specific. \"Convenience\" is not an answer. What specific task does it accomplish, and how important is that task?")],
            [txt("Who benefits most?", 1), txt(" If you're not paying for the product, you are the product. But even paid products may extract value from you in non-obvious ways.")],
            [txt("What are the second-order effects?", 1), txt(" Does this tool change my behavior, expectations, or relationships in ways I haven't consented to?")],
            [txt("What would I do without it?", 1), txt(" Often the answer reveals that the \"need\" is manufactured — you managed fine before, and the tool created the dependency it now claims to solve.")]
        ]),

        heading("2. Choose", "h3"),
        para(
            txt("Once you've evaluated, make a deliberate choice. Not a default, not a drift, not an unexamined continuation of habit — a choice. Some technologies will pass the evaluation easily: a bicycle, a good knife, a well-built bookshelf, a simple note-taking app that stores files locally. Others will fail: the social media platform that gives you 20 minutes of entertainment in exchange for two hours of attention and a comprehensive behavioral profile.")
        ),
        para(
            txt("The key word is "),
            txt("intentionality", 2),
            txt(". The opposite of Low Tech, High Life is not High Tech — it's "),
            txt("Unconsidered Tech", 2),
            txt(". You can use sophisticated technology and still live by Low Tech, High Life principles, as long as the choice is deliberate and the costs are accepted consciously.")
        ),

        heading("3. Simplify", "h3"),
        para(
            txt("Use the minimum viable technology for each need. If a text file does the job, don't use a database. If a phone call resolves the issue, don't start an email thread. If a physical notebook captures your thoughts effectively, don't install another productivity app. Complexity has costs: maintenance, cognitive overhead, dependencies, potential for failure, and learning curves that steal time from the actual work.")
        ),
        para(
            txt("Simplification is not about deprivation. It's about "),
            txt("signal-to-noise ratio", 2),
            txt(". A workshop with three well-made tools is more productive than one with thirty cheap gadgets. The same principle applies to your digital environment.")
        ),

        heading("4. Own", "h3"),
        para(
            txt("Prefer tools you control over platforms that control you. This is the most radical step, and the most rewarding. Ownership means:")
        ),
        bullet_list([
            [txt("Your data lives on your hardware", 1), txt(", not on someone else's server where it can be mined, sold, or deleted at their discretion.")],
            [txt("Your tools work offline", 1), txt(". If a service disappears tomorrow, your work survives.")],
            [txt("You can inspect, modify, and repair", 1), txt(" your tools. Open-source software and repairable hardware embody this principle.")],
            [txt("You are a user, not a product", 1), txt(". The business model of the tool aligns with your interests, not with an advertiser's.")]
        ]),

        # Section 3
        heading("Adjacent Movements"),
        para(
            txt("Low Tech, High Life exists in a constellation of related movements. Understanding the connections and differences clarifies what makes this framework distinct.")
        ),
        bullet_list([
            [txt("Cottagecore", 1), txt(" is primarily an aesthetic movement romanticizing rural and domestic life. Low Tech, High Life shares the appreciation for simplicity but is "), txt("philosophical and practical", 2), txt(" rather than aesthetic. You can practice Low Tech, High Life in a city apartment; you don't need a garden or a bread oven (though those are nice).")],
            [txt("Solarpunk", 1), txt(" envisions a future where technology and nature coexist harmoniously, powered by renewable energy and guided by community values. Low Tech, High Life is complementary but more "), txt("skeptical", 2), txt(" — it doesn't assume that the right technology will save us. It focuses on the present tense: what do we do "), txt("now", 2), txt(", with the tools that exist today?")],
            [txt("Digital minimalism", 1), txt(" (Cal Newport) focuses specifically on reducing digital clutter and reclaiming attention from screens. Low Tech, High Life encompasses digital minimalism but extends beyond screens to all technology, and adds the dimensions of "), txt("ownership and political awareness", 2), txt(" that Newport's framework lacks.")],
            [txt("Right to repair", 1), txt(" is the legal and political movement demanding that consumers be allowed to fix their own devices. Low Tech, High Life supports this cause and adds: you should also have the right to "), txt("understand", 2), txt(" your devices, to "), txt("choose", 2), txt(" alternatives, and to "), txt("refuse", 2), txt(" upgrades that don't serve you.")],
            [txt("Degrowth", 1), txt(" challenges the economic imperative of perpetual growth. Low Tech, High Life applies degrowth thinking to the personal technology sphere: not every upgrade is progress, not every new feature is desirable, and \"more\" is not always \"better.\"")]
        ]),

        # Section 4
        heading("Practical Substitutions"),
        para(
            txt("Theory is nothing without practice. Here are concrete substitutions that embody Low Tech, High Life principles. None of these are mandatory — they are options, and the right choice depends on your circumstances, skills, and priorities.")
        ),
        bullet_list([
            [txt("Streaming services → local music library. ", 1), txt("Download your music via Soulseek, Bandcamp, or even CD ripping. Store it locally. Use a simple player. You'll own your collection forever, discover music through human recommendation rather than algorithms, and never lose a favorite album because a licensing deal expired.")],
            [txt("Cloud storage → selfhosted NAS. ", 1), txt("A basic NAS (Synology, or a Raspberry Pi with an external drive) gives you cloud convenience without cloud surveillance. Your files, your hardware, your rules. Syncthing can replace Dropbox for cross-device sync.")],
            [txt("Social media feeds → RSS readers + newsletters. ", 1), txt("RSS is the original \"subscribe\" — it's decentralized, algorithm-free, and puts you in complete control of your information diet. Add curated newsletters from writers you trust. You'll read less but understand more.")],
            [txt("Smart home → thoughtful home. ", 1), txt("A smart speaker is a corporate microphone in your living room. A thermostat with a timer does the same job as a \"smart\" thermostat without sending your temperature preferences to a server in Virginia. Evaluate each smart device: is the convenience worth the surveillance?")],
            [txt("Smartphone dependency → intentional phone use. ", 1), txt("You probably can't ditch your smartphone entirely. But you can remove social media apps, disable notifications, switch to grayscale mode, and carry a book for moments when you'd normally scroll. Some people keep a feature phone for calls and texts, and use a laptop for everything else.")],
            [txt("Algorithmic discovery → human curation. ", 1), txt("Ask friends what they're reading. Browse a physical bookstore. Read a magazine cover to cover. Join a book club. The best recommendations come from people who know you, not from systems that profile you.")]
        ]),

        # Section 5
        heading("The Paradox"),
        para(
            txt("You're reading this on the internet. This article was written on a computer, hosted on a server, delivered through infrastructure built by the very corporations we've been critiquing. Is this hypocrisy?")
        ),
        para(
            txt("No. And recognizing why is essential to understanding Low Tech, High Life. This framework is not about purity or rejection. It is about "),
            txt("intentionality", 1),
            txt(". The goal is not to eliminate technology from your life but to ensure that every piece of technology in your life is there because you chose it, because the costs are acceptable, and because the benefits are genuine.")
        ),
        para(
            txt("We use the master's tools to dismantle the master's house — or at least to build a better one next door. The internet is a magnificent tool for sharing knowledge, connecting communities, and coordinating action. It is also a surveillance apparatus, an addiction machine, and an extraction engine. Both things are true simultaneously. Low Tech, High Life is the practice of using the good parts while resisting the bad ones, with clear eyes and deliberate choices.")
        ),
        para(
            txt("Use technology. Just don't let it use you.")
        ),

        # Further Reading
        heading("Further Reading"),
        para(
            txt("For the original exploration of these ideas in Spanish, see the 421.news archives on "),
            link("https://www.421.news/es/tag/tech/", "technology"),
            txt(" and "),
            link("https://www.421.news/es/tag/real-life/", "real life"),
            txt(". Related articles:")
        ),
        bullet_list([
            [link("https://www.421.news/en/what-is-cognitive-sovereignty-framework/", "What Is Cognitive Sovereignty?"), txt(" — A complementary framework for protecting mental autonomy in the attention economy.")],
            [link("https://www.421.news/en/enshittification-reverse-engineering-guide/", "The Enshittification of the Internet"), txt(" — Understanding why platforms degrade and how to resist the cycle.")],
            [txt("Cal Newport, "), txt("Digital Minimalism", 2), txt(" (2019) — A more focused take on reducing digital clutter.")],
            [txt("E.F. Schumacher, "), txt("Small Is Beautiful", 2), txt(" (1973) — The intellectual ancestor of appropriate technology movements.")],
            [txt("Ivan Illich, "), txt("Tools for Conviviality", 2), txt(" (1973) — The original argument for tools that serve users rather than enslave them.")]
        ]),
    )

    return {
        "title": "Low Tech, High Life: The Anti-Cyberpunk Manifesto",
        "slug": "low-tech-high-life-manifesto",
        "lexical": content,
        "status": "published",
        "authors": [{"id": AUTHOR_ID}],
        "tags": [{"slug": "tech"}, {"slug": "real-life"}, {"slug": "hash-en"}],
        "meta_title": "Low Tech, High Life: The Anti-Cyberpunk Manifesto | 421.news",
        "meta_description": "Low Tech, High Life is a framework for evaluating the costs of technology and choosing simplicity, intentionality, and autonomy over hyper-connectivity. A practical guide to the inverse of cyberpunk.",
        "custom_excerpt": "Low Tech, High Life is a philosophy that proposes evaluating the costs, benefits, and demands of the technologies we use daily — choosing simplicity, intentionality, and autonomy over hyper-connectivity.",
        "og_title": "Low Tech, High Life: The Anti-Cyberpunk Manifesto | 421.news",
        "twitter_title": "Low Tech, High Life: The Anti-Cyberpunk Manifesto | 421.news",
        "featured": False,
    }


# ─────────────────────────────────────────────────────────────
# POST 3: Enshittification
# ─────────────────────────────────────────────────────────────

def build_post3():
    content = lexical(
        # Opening definition
        para(
            txt("Enshittification", 1),
            txt(" is the process by which digital platforms systematically degrade user experience to maximize profit. The term, coined by Cory Doctorow, describes a three-stage cycle: platforms first attract users with value, then extract value from users to attract business customers, then extract value from everyone until the platform collapses or becomes a zombie institution sustained only by lock-in. This guide provides a reverse-engineering framework for understanding the mechanics of enshittification and practical strategies for resisting it.")
        ),
        para(
            txt("If you've ever felt that a service you once loved has gotten worse — more ads, fewer features, higher prices, more dark patterns — you're not imagining things. You're experiencing enshittification. And understanding the pattern is the first step toward breaking free of it.")
        ),

        # Section 1
        heading("The Enshittification Cycle"),
        para(
            txt("Every platform that enshittifies follows the same three-stage trajectory. The stages are not accidental — they are the logical consequence of the venture-capital-funded platform business model. Understanding each stage allows you to identify where any given platform currently sits in the cycle, and to make informed decisions about whether to continue using it.")
        ),

        heading("Stage 1: User Acquisition", "h3"),
        para(
            txt("In the first stage, the platform is generous. It subsidizes services, offers excellent user experience, supports interoperability, and generally behaves as if its primary mission is to serve users. This is the \"too good to be true\" phase, and it is, in fact, too good to be true.")
        ),
        para(
            txt("During this stage, the platform is burning investor money to build a user base. The economics don't work — the service costs more to provide than it generates in revenue. But that's the plan: grow fast, achieve network effects, make the platform indispensable, and then move to Stage 2.")
        ),
        para(txt("Examples of Stage 1 behavior:")),
        bullet_list([
            [txt("Google Search (early 2000s): ", 1), txt("Clean interface, no ads above the fold, genuinely useful results. The best search engine by a wide margin, offered completely free.")],
            [txt("Facebook (2004-2012): ", 1), txt("Chronological feed, no ads, easy photo sharing, genuine social connection. It felt like a public utility for staying in touch with friends.")],
            [txt("Amazon (late 1990s-2000s): ", 1), txt("Below-cost pricing, free shipping, excellent customer service, generous return policies. The company lost money for years to build its customer base.")],
            [txt("Spotify (2008-2015): ", 1), txt("Vast music library, clean interface, reasonable free tier, fair artist payments (relatively speaking). Music streaming felt like magic.")],
            [txt("Uber (2012-2017): ", 1), txt("Rides cheaper than taxis, fast pickup times, easy payment, friendly drivers earning good money. Subsidized entirely by venture capital.")]
        ]),

        heading("Stage 2: Business Pivot", "h3"),
        para(
            txt("Once the platform has achieved sufficient scale and lock-in, it begins extracting value from users to attract business customers (advertisers, merchants, content creators who pay for reach). The user experience degrades, but not enough to trigger mass exodus — the lock-in from Stage 1 keeps people in place.")
        ),
        para(txt("Stage 2 tactics include:")),
        bullet_list([
            [txt("Advertising injection: ", 1), txt("Ads appear in feeds, search results, and interfaces that were previously ad-free. The ads are initially labeled clearly; over time, the distinction between organic and paid content blurs.")],
            [txt("Data harvesting intensification: ", 1), txt("The platform collects more data, shares it more broadly, and uses it for increasingly invasive targeting. Privacy policies get longer and less comprehensible.")],
            [txt("Algorithmic manipulation: ", 1), txt("Chronological feeds are replaced by algorithmic ones that prioritize \"engagement\" (content that provokes strong emotional reactions) over relevance or quality. Users see what the algorithm decides, not what they chose.")],
            [txt("Feature removal or degradation: ", 1), txt("Free features become paid. API access is restricted or eliminated. Export tools are buried or disabled. The platform actively makes it harder to leave.")],
            [txt("Creator squeeze: ", 1), txt("Content creators who built audiences on the platform find their organic reach throttled. To reach the audience they already built, they must now pay for promotion.")]
        ]),

        heading("Stage 3: Terminal Extraction", "h3"),
        para(
            txt("In the final stage, the platform extracts maximum value from everyone — users, business customers, and creators alike. Quality collapses. The service becomes a shell of its former self, sustained only by the switching costs and network effects that make leaving painful.")
        ),
        para(txt("Terminal extraction looks like:")),
        bullet_list([
            [txt("Search results full of ads and SEO spam: ", 1), txt("Google's first page is now ads, AI-generated summaries, \"People also ask\" boxes, and featured snippets — the actual organic results are pushed below the fold.")],
            [txt("Social feeds dominated by recommended content from strangers: ", 1), txt("Instagram and Facebook show you more content from accounts you don't follow than from accounts you do. Your feed is no longer yours.")],
            [txt("Marketplace flooded with counterfeits and paid placements: ", 1), txt("Amazon's search results are a pay-to-play jungle. Sponsored products, fake reviews, and counterfeit goods make it nearly impossible to find what you're actually looking for.")],
            [txt("API shutdown: ", 1), txt("Twitter/X killed third-party clients, Reddit priced out third-party apps, and Google has systematically deprecated APIs that enabled independent innovation on their platforms.")],
            [txt("Price increases with declining quality: ", 1), txt("Streaming services raise prices while reducing content libraries and introducing ad tiers. Subscription fatigue is a direct consequence of terminal extraction across multiple platforms simultaneously.")]
        ]),

        # Section 2
        heading("Why Enshittification Happens"),
        para(
            txt("Enshittification is not a bug — it is a feature of the venture-capital-funded platform business model. Understanding the structural causes reveals why individual companies aren't really the problem; the incentive structure is.")
        ),
        bullet_list([
            [txt("Venture capital growth mandates: ", 1), txt("VC-funded companies must grow at rates that justify their valuations. A company valued at $10 billion must generate returns that justify that valuation, which means extracting far more value than a sustainable business would. The growth imperative makes enshittification mathematically inevitable once organic growth slows.")],
            [txt("Network effects as lock-in: ", 1), txt("The value of a social network, marketplace, or communication platform depends on how many other people use it. Once a platform achieves critical mass, leaving means losing access to your network — your friends, your customers, your audience. This lock-in gives the platform enormous power to degrade quality without losing users.")],
            [txt("The advertising business model: ", 1), txt("When the customer (the advertiser) and the user (you) are different entities, the platform's incentives diverge from yours. Your attention is the product being sold. The platform is optimizing for the advertiser's satisfaction, not yours. Any improvement to your experience that reduces ad revenue will eventually be reversed.")],
            [txt("Regulatory capture: ", 1), txt("Large platforms invest heavily in lobbying, ensuring that regulations either don't exist or are written in ways that entrench incumbents and raise barriers to entry for competitors.")],
            [txt("Switching costs and data portability barriers: ", 1), txt("Platforms deliberately make it difficult to export your data, transfer your social graph, or move your content to a competitor. The harder it is to leave, the more abuse you'll tolerate.")]
        ]),

        # Section 3
        heading("The Reverse-Engineering Toolkit"),
        para(
            txt("Understanding enshittification is necessary but not sufficient. The goal is to develop practical strategies for resisting it — or at least for minimizing its impact on your life. Here is a four-part toolkit.")
        ),

        heading("Identify the Stage", "h3"),
        para(
            txt("For every platform you use regularly, determine where it sits in the enshittification cycle. This isn't always obvious — platforms don't announce their transition from Stage 1 to Stage 2. But there are reliable signals:")
        ),
        bullet_list([
            [txt("Are there more ads than there were a year ago?")],
            [txt("Has the algorithm changed what you see without your consent?")],
            [txt("Have features been removed, paywalled, or degraded?")],
            [txt("Has the platform restricted API access or third-party integrations?")],
            [txt("Does the platform make it harder to export your data than it used to?")],
            [txt("Has the platform started showing you content from accounts you don't follow?")]
        ]),
        para(
            txt("If you answered yes to three or more of these, the platform is likely in Stage 2 or early Stage 3. Plan your exit strategy accordingly.")
        ),

        heading("Reduce Lock-in", "h3"),
        para(
            txt("The platform's power over you is proportional to your lock-in. Every step you take to reduce lock-in increases your freedom to leave when the enshittification becomes intolerable.")
        ),
        bullet_list([
            [txt("Export your data regularly. ", 1), txt("Most platforms offer data export (often buried in settings). Use it. Keep local copies of your photos, posts, messages, and contacts.")],
            [txt("Use interoperable formats. ", 1), txt("Write in Markdown, not in a proprietary editor. Store files in open formats (PDF, PNG, MP3, CSV) rather than platform-specific ones.")],
            [txt("Maintain presence on alternatives. ", 1), txt("Even if you primarily use one platform, keep an account on an alternative. When the time comes to switch, you won't be starting from zero.")],
            [txt("Build your audience on owned property. ", 1), txt("If you create content, your home base should be a website or newsletter you control — not a social media profile that can be throttled, banned, or enshittified at any time.")]
        ]),

        heading("Use Alternatives", "h3"),
        para(
            txt("For nearly every enshittified platform, a better alternative exists — often open-source, federated, or community-owned. The tradeoff is usually convenience and network size for quality and autonomy.")
        ),
        bullet_list([
            [txt("Search: ", 1), txt("Kagi (paid, no ads, excellent quality), DuckDuckGo (free, private), SearXNG (selfhosted metasearch).")],
            [txt("Social media: ", 1), txt("Mastodon/Fediverse (federated, no algorithm), Bluesky (decentralized protocol), or simply RSS + blogs.")],
            [txt("Email: ", 1), txt("Fastmail, Proton Mail, or selfhosted (instead of Gmail, which reads your email to target ads).")],
            [txt("Cloud storage: ", 1), txt("Syncthing + local NAS (instead of Google Drive/Dropbox).")],
            [txt("Maps: ", 1), txt("OpenStreetMap + Organic Maps (instead of Google Maps, which tracks your location history).")],
            [txt("Video: ", 1), txt("PeerTube (federated), Nebula (creator-owned), or NewPipe/Invidious as YouTube front-ends that strip tracking and ads.")],
            [txt("Messaging: ", 1), txt("Signal (encrypted, non-profit), Matrix/Element (federated, encrypted), or XMPP (the original open messaging protocol).")]
        ]),

        heading("Build Community Infrastructure", "h3"),
        para(
            txt("Individual action is important but insufficient. The deepest resistance to enshittification comes from building and supporting alternatives that are structurally resistant to the cycle — because they have different ownership models and incentive structures.")
        ),
        bullet_list([
            [txt("Support cooperatively owned platforms", 1), txt(" where users are owners and the incentive is to serve members rather than extract from them.")],
            [txt("Contribute to open-source projects", 1), txt(" that provide alternatives to enshittified services. Code, documentation, bug reports, and financial contributions all help.")],
            [txt("Advocate for local-first software", 1), txt(" — applications that store data on your device and sync peer-to-peer, rather than requiring a central server that can be enshittified.")],
            [txt("Support legislation", 1), txt(" that mandates interoperability, data portability, and the right to exit platforms with your data and social graph intact.")]
        ]),

        # Section 4
        heading("Beyond Individual Action"),
        para(
            txt("Personal choices matter, but enshittification is a structural problem that requires structural solutions. Several policy and legal frameworks are emerging to address it:")
        ),
        bullet_list([
            [txt("The EU Digital Markets Act (DMA)", 1), txt(" designates large platforms as \"gatekeepers\" and imposes interoperability requirements, bans self-preferencing, and mandates data portability. It is the most ambitious regulatory response to platform power in history.")],
            [txt("Right to repair legislation", 1), txt(" is expanding from physical hardware to digital services. The principle that you should be able to fix, modify, and understand the tools you use is being extended to software and platforms.")],
            [txt("Adversarial interoperability", 1), txt(" — the practice of building tools that work with a platform without its permission (ad blockers, alternative clients, data scrapers) — is a powerful form of resistance. Doctorow argues that legalizing and protecting adversarial interoperability would do more to fight enshittification than any other single policy.")],
            [txt("Community-owned infrastructure", 1), txt(" — from cooperatively owned broadband to community-run social media instances — provides alternatives that are structurally resistant to enshittification because they don't have shareholders demanding infinite growth.")]
        ]),
        para(
            txt("The enshittification cycle is not inevitable. It is a consequence of specific ownership structures, business models, and regulatory environments. Change those, and you change the outcome. In the meantime, understanding the cycle gives you the power to make informed choices about which platforms deserve your time, your data, and your trust — and which ones have forfeited all three.")
        ),

        # Further Reading
        heading("Further Reading"),
        bullet_list([
            [txt("Cory Doctorow, "), link("https://pluralistic.net/2023/01/21/potemkin-ai/#hey-guys", "\"Tiktok's Enshittification\""), txt(" (2023) — The original essay that named and defined the pattern.")],
            [txt("Cory Doctorow, "), txt("The Internet Con: How to Seize the Means of Computation", 2), txt(" (2023) — A book-length treatment of enshittification and the case for adversarial interoperability.")],
            [link("https://www.421.news/en/what-is-cognitive-sovereignty-framework/", "What Is Cognitive Sovereignty?"), txt(" — A complementary framework from 421.news on protecting mental autonomy from platform manipulation.")],
            [link("https://www.421.news/en/low-tech-high-life-manifesto/", "Low Tech, High Life"), txt(" — A practical framework for choosing simpler, more intentional tools over enshittified platforms.")],
            [txt("Shoshana Zuboff, "), txt("The Age of Surveillance Capitalism", 2), txt(" (2019) — The definitive analysis of how platforms extract and monetize behavioral data.")],
            [txt("Tim Wu, "), txt("The Attention Merchants", 2), txt(" (2016) — A historical account of how attention has been captured and sold, from newspapers to social media.")]
        ]),
    )

    return {
        "title": "The Enshittification of the Internet: A Reverse-Engineering Guide",
        "slug": "enshittification-reverse-engineering-guide",
        "lexical": content,
        "status": "published",
        "authors": [{"id": AUTHOR_ID}],
        "tags": [{"slug": "tech"}, {"slug": "hash-en"}],
        "meta_title": "The Enshittification of the Internet: A Reverse-Engineering Guide",
        "meta_description": "Enshittification is the process by which platforms degrade user experience to maximize profit. Learn the three-stage cycle, why it happens, and a practical toolkit for resisting it.",
        "custom_excerpt": "Enshittification is the process by which digital platforms systematically degrade user experience to maximize profit. This guide reverse-engineers the cycle and provides practical strategies for resistance.",
        "og_title": "The Enshittification of the Internet: A Reverse-Engineering Guide",
        "twitter_title": "The Enshittification of the Internet: A Reverse-Engineering Guide",
        "featured": False,
    }


# ─────────────────────────────────────────────────────────────
# Main: create all 3 posts
# ─────────────────────────────────────────────────────────────

def create_post(post_data):
    token = get_jwt_token()
    url = f"{GHOST_URL}/ghost/api/admin/posts/"
    headers = {
        "Authorization": f"Ghost {token}",
        "Content-Type": "application/json",
    }
    body = {"posts": [post_data]}
    resp = requests.post(url, headers=headers, json=body)
    if resp.status_code == 201:
        post = resp.json()["posts"][0]
        return post["url"], post["title"]
    else:
        print(f"ERROR creating '{post_data['title']}': {resp.status_code}")
        print(resp.text[:500])
        return None, post_data["title"]


def main():
    builders = [build_post1, build_post2, build_post3]
    for builder in builders:
        post_data = builder()
        url, title = create_post(post_data)
        if url:
            print(f"✓ Created: {title}")
            print(f"  URL: {url}")
        else:
            print(f"✗ Failed: {title}")
        print()


if __name__ == "__main__":
    main()
