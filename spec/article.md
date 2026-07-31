# Sunburst — An interactive guide

## Intro

It's been over 10 years since I left the [DaisyDisk team](https://daisydiskapp.com/about) and its legacy seems to be gathering dust.
Unfortunately, there are no good open-source, actively maintained alternatives, and what's on the market is rather mediocre.

<sunburst data="disk" controls="[]" locked="{centerOpacity:0}" caption="DaisyDisk-inspired interactive sunburst map" />

I wrote this article for a few reasons.

First, it is my attempt to pay back the debt to the community and share a few things I learned about sunburst visualization while creating DaisyDisk so that anyone may use this visualization in their own project. Second, I always wanted to try an [explorable explanations](https://en.wikipedia.org/wiki/Explorable_explanation) article format rather than a traditional mix of words and images. And third, as a designer who'd stopped coding long before most of you started, I wanted to experiment with modern [open AI agents](https://opencode.ai) and recover the joy of actually building something that runs.

Even if it's neuroslopped rather than hand-crafted. Better shipped than perfect.

The article and its spec files are available under a very unrestrictive [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) license while the code is [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).

Play, learn, disagree, critique, break, improve and build your own tools. It's fun.

## Long time ago…

[Manuel Lima](https://www.mslima.com/publications) did a great job categorizing tree-structure visualizations in The Book of Trees and The Book of Circles, tracing sunburst-like diagrams back centuries. But our story starts in the 90s.

<treemap data="disk" controls="[]" locked="{coloring:lastUpdated,aspectRatio:'16:9',algorithm:sliceAndDice,cushion:true}" caption="A static treemap displaying sample disk content"/>

In the early 1990s, Ben Shneiderman and Brian Johnson [introduced](https://www.cs.umd.edu/~ben/papers/Johnson1991Tree.pdf) the treemap at the University of Maryland — a space-filling approach that divided a rectangle into nested subdivisions.

Treemaps quickly became the dominant way to visualize file systems in tools like [WinDirStat](https://windirstat.net) and [GrandPerspective](https://grandperspectiv.sourceforge.net), but their rectangular layout made deep hierarchies hard to navigate. Its strength — packing the rectangle densely — is also its curse: resize the window and every tile reshuffles.

This technique still works perfectly for static data or simple structures, but it takes real effort to make it useful for complex, deeply nested data sets like a file system.

<stasko data="disk" ringWidth="50" caption="A static sunburst map recreated after Stasko articles" />

About a decade after Shneiderman, John Stasko and Eugene Zhang experimented with radial treemaps and found that students preferred them to regular treemaps for navigating file-system structure. They called the new visualization technique a [SunBurst](https://sites.cc.gatech.edu/gvu/ii/sunburst/) — a name that later became canonical as Sunburst.

In 2000 Steffen Gerlach launched [Scanner](http://steffengerlach.de/freeware/index.html) for Windows, and in 2004 Max Howell (the maker of the Homebrew package manager) released [Filelight](https://apps.kde.org/filelight/) for Linux. Both products, created independently, shared the same goal of helping users understand their disk usage and looked way closer to modern sunbursts than the original Stasko experiments.

DaisyDisk was revealed in 2008 and in a few years became the reference Sunburst implementation giving this visualization technique a second wind. The interesting part was that during its design we only learned from Scanner and tried to mitigate its shortcomings like inconsistent sorting and a lack of animation while only finding out about Filelight and Stasko Sunbursts after reinventing most of the things on our own.

There's little magical about the Sunburst at a glance.

You take an [Icicle plot](https://www.tandfonline.com/doi/abs/10.1080/00031305.1983.10482733), wrap it and, voilà, you have a sunburst map.

<icicle data="disk" controls="[morph]" caption="Move the slider to unwrap a sunburst into an icicle"/>

Yet the process of actually making it useful took decades because of a few less obvious things I'll try to cover below.

## Building a frame

Sunbursts are especially good for visualizing and navigating tree structures where each entity has a certain value assigned. A file system tree where each file and folder has a clear size is a great example.

Let's try visualizing a sample file system using a sunburst map. Shouldn't be hard.

<sunburst-mvp caption="A sunburst, sorted by name — flip the toggle to sort every level by size" />

It looks familiar, but weird.

Rings are there, the structure is visible, yet something feels really off.

No colors? Maybe.

But the main thing wrong here is the sorting. Flip the "Sort by size" toggle: every sector glides to its new place and the map reads way better. We'll add colors in a moment — the classic "wheel" coloring where each sector gets a hue based on its angular position.

> Why size? Because the angular size of each petal is proportional to the size of the object.
If we wanted, we could have used another base value. Say, build the diagram on top of object age, so that it's easier to pick out older ones.

Position?

DaisyDisk got its iconic look because of a simple trick: it mapped each sector to a hue value in the color wheel. The center of the sector defines the hue, and the more folders you have, the more of the hue wheel gets covered — so the daisy grows more colorful as the disk fills up.

<sunburst-hue controls="[hueOffset]" caption="The color ring maps angular position to hue — each folder's fill matches the ring at its angle" />

It's surprising that you can get really good results with simple [HSL](https://en.wikipedia.org/wiki/HSL_and_HSV).

But HSL isn't the only option. There's [okLCH](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl), a color space that's perceptually uniform — equal hue steps look equally far apart to the eye. That sounds ideal, and in print-style palettes it often is. But for the sunburst's rainbow wheel, uniformity works against us: okLCH spreads the blues and compresses the greens and yellows, so the hue ring stops being a smooth, even rainbow and the daisy looks patchy. HSL's naive, unscientific hue wheel happens to give us the colorful daisy we want.

<sunburst-hue controls="[colorModel]" caption="Switch between HSL and okLCH to see how the color space choice affects the map's appearance" />

And why aren't we using the <abbr title="saturation">S</abbr> and <abbr title="lightness">L</abbr> components of the color for the second, third, etc. level rings so that they are clearly distinguishable?

<sunburst-hue controls="[depthSL]" caption="Try adding depth with Saturation and Lightness" />

Once again, a fantastic suggestion. It looks pretty at first glance, but the darker colors at the outer rings become hard to tell apart.

> And it's one of my favorite things about sunburst: almost every time you hit on a simple, elegant improvement to the map, it turns out to mostly make things worse.

Say, why not make outer rings smaller based on their distance from the center?

Should have worked, huh… I believe you still have lots of great ideas. Believe me, we tried many. *Many*.

The great news is that now you may try all these in seconds by asking an AI agent to tweak the map.

## Adding the details

At this point you might be wondering how the heck are we supposed to find out what each sector is?

I've added a small overlay on top of each sector so that you may hover them and identify what each one belongs to.

<sunburst-playground controls="[files]" caption="A sunburst map with folders only; use the toggle to display files" />

But wait — what happened to the files?

> Sunburst may be useful for displaying tree structures which don't have the notion of files and folders, but that's not the case for the file system. Furthermore, lots of tweaks in this section are specific to file systems and might be less useful when displaying a simpler data set.

On our disk the rules are <abbr title="not that much simple on macOS with things like bundles">more or less simple</abbr>: folders may contain both files and folders while files cannot contain anything. And files should be distinguishable from folders, so we render them achromatically.

The main problem with files is that they can be many. A folder with icons would add a lot of visual noise resulting in a rather annoying [moiré pattern](https://en.wikipedia.org/wiki/Moiré_pattern) that's clearly visible on many Sunburst images you find on the internet.

We may get rid of this effect by introducing a ~2° threshold hiding all smaller sectors.

This fixes the moiré, but introduces a new problem: it hides *every* file under 2°, even when a folder holds hundreds of tiny files whose sizes add up to something significant. They vanish one by one, with nothing to show they were ever there.

An elegant solution to this issue was the introduction of `smaller objects`, a virtual sector representing a combination of multiple individual objects. You can't see each file at this level of detail, but its mere presence gives the surrounding sectors context — [the Tufte principle](https://www.edwardtufte.com/notebook/chartjunk/) that representing the shape of the data beats hiding it.

<sunburst-playground controls="[smallerObjects]" files="true" caption="Displaying tiny files or aggregating them into a special smaller objects sector" />

Visually, a `smaller objects` sector looks a lot like a file, but with added transparency to be better distinguishable from regular files.

<sunburst-playground controls="[singleChildren]" files="true" smallerObjects="true" caption="Displaying or hiding sole children of the parent" />


Another small touch: if a parent sector has only one visible child — usually a file or a `smaller objects` aggregate — we drop that child and let the parent represent the whole branch. The child was redundant: the parent's span already covers that subtree, so showing both just wastes a ring. Removing the duplicate makes the map read cleaner without losing any information.

## Going deeper

The Sunburst map has five rings plus a zero-level center ring representing the parent folder.

But why five?

Stasko's initial experiments displayed 7+ levels of rings while later work like Max Howell's Filelight clearly had a five-ring cap.

<sunburst-geometry controls="[ringLevels]" growthRate="1" smallerRings="false" caption="Drag the ring count to see how more rings eat up space" />

Why five? In our experience, adding more equal-width rings just makes the map busier and wastes space rather than adding value.

Time for the next intuitively-right idea, which in practice is equally wrong: make each ring a little narrower than the one inside it, so a ring's width reflects the shrinking "weight" of its depth level and the outer rings reclaim some space.

<sunburst-geometry controls="[growthRate]" ringLevels="5" smallerRings="false" caption="Move the slider to see how different ring widths affect the look and feel of the map" />



In practice, a better solution would be using a 10-level ring system: up to five large rings and up to five smaller outer rings for displaying deeper levels of file system structure. This lets us display 10 levels at once, enough for nearly any real-world data set, and because the outer rings are thin, the inner five get the room they need to stay legible.

<sunburst-geometry controls="[smallerRings]" ringLevels="10" growthRate="1" caption="Same-width rings vs smaller outer rings" />


## Navigating your way

I first discovered a way to navigate Sunburst maps by watching Steffen Gerlach's Scanner in action.

It felt unbelievably natural: click a sector to drill in, click a center to return one level up. The main shortcoming was a lack of transition between current and target folders — they just changed immediately, leaving you clueless about how you got from point A to point B.

<sunburst data="disk" controls="[animateNavigation]" locked="{animateNavigation:false}" breadcrumb="true" caption="Toggle animations on and off and see how it changes the feel of the map" />

Adding the transition between these states was indeed one of the best things in DaisyDisk (kudos to Oleg for his engineering work) and something that most imitators [couldn't replicate](https://www.reddit.com/r/macapps/comments/1mxnw9y/diskpoint_disk_cleaning_utility_you_will_love/).
The key was achieving an effect where the whole map moves in polar coordinates from source to target in one continuous motion rather than sectors randomly moving between states.

The key is a state machine that distinguishes the different kinds of transitions and choreographs each one independently. This isn't a detail you can hand-wave: a proper transition model demands a systematic, careful approach, and the animation's apparent simplicity is exactly what misguides most attempts to copy it. You've been watching that state machine run in every interactive sunburst above — flip the Animation toggle on the widget above and click around to feel it move.

## Outro
Now you know more about sunburst maps than I did back in 2008 — and you can apply it to your own data visualization projects.

If this article was even slightly useful, or encouraged you to start your own experiments with other visualization techniques, I'd be delighted.

My work here is done. I'll leave you to play with the widgets — and, I hope, to build something of your own.
