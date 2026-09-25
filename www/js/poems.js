/* ----------------------------------------------------
 * BUILT-IN POEM LIBRARY
 * Public-domain poems that work with no API key and no internet.
 * Chosen to fit Reveille's rules:
 *   1. Something happens — a scene unfolds
 *   2. Fresh, surprising imagery
 *   3. The central idea is left open at the last line
 *   4. Short enough to hear before you're fully awake
 * To add your own, copy an entry and give it a unique id.
 * archetype: "narrative" | "surprising"
 * season: "autumn" | "winter" | "spring" | "summer" | "rain"
 * ---------------------------------------------------- */
export const LIBRARY_POEMS = [
    {
        id: "stevens-disillusionment",
        title: "Disillusionment of Ten O'Clock",
        author: "Wallace Stevens",
        archetype: "narrative",
        season: "autumn",
        lines: [
            "The houses are haunted",
            "By white night-gowns.",
            "None of them are green,",
            "Or purple with green rings,",
            "Or green with yellow rings,",
            "Or yellow with blue rings.",
            "None of them are strange,",
            "With socks of lace",
            "And beaded ceintures.",
            "People are not going to dream of baboons and periwinkles.",
            "Only, here and there, an old sailor,",
            "Drunk and asleep in his boots,",
            "Catches tigers",
            "In red weather."
        ]
    },
    {
        id: "frost-stopping",
        title: "Stopping by Woods on a Snowy Evening",
        author: "Robert Frost",
        archetype: "narrative",
        season: "winter",
        lines: [
            "Whose woods these are I think I know.",
            "His house is in the village though;",
            "He will not see me stopping here",
            "To watch his woods fill up with snow.",
            "",
            "My little horse must think it queer",
            "To stop without a farmhouse near",
            "Between the woods and frozen lake",
            "The darkest evening of the year.",
            "",
            "He gives his harness bells a shake",
            "To ask if there is some mistake.",
            "The only other sound’s the sweep",
            "Of easy wind and downy flake."
        ]
    },
    {
        id: "sandburg-fog",
        title: "Fog",
        author: "Carl Sandburg",
        archetype: "surprising",
        season: "rain",
        lines: [
            "The fog comes",
            "on little cat feet.",
            "",
            "It sits looking",
            "over harbor and city",
            "on silent haunches",
            "and then moves on."
        ]
    },
    {
        id: "whitman-spider",
        title: "A Noiseless Patient Spider",
        author: "Walt Whitman",
        archetype: "narrative",
        season: "spring",
        lines: [
            "A noiseless patient spider,",
            "I mark’d where on a little promontory it stood isolated,",
            "Mark’d how to explore the vacant vast surrounding,",
            "It launch’d forth filament, filament, filament, out of itself,",
            "Ever unreeling them, ever tirelessly speeding them.",
            "",
            "And you O my soul where you stand,",
            "Surrounded, detached, in measureless oceans of space,",
            "Ceaselessly musing, venturing, throwing, seeking the spheres to connect them."
        ]
    },
    {
        id: "crane-desert",
        title: "In the Desert",
        author: "Stephen Crane",
        archetype: "narrative",
        season: "summer",
        lines: [
            "In the desert",
            "I saw a creature, naked, bestial,",
            "Who, squatting upon the ground,",
            "Held his heart in his hands,",
            "And ate of it.",
            "I said, 'Is it good, friend?'",
            "'It is bitter—bitter,' he answered;",
            "",
            "'But I like it,'",
            "'Because it is bitter,'",
            "'And because it is my heart.'"
        ]
    },
    {
        id: "hulme-autumn",
        title: "Autumn",
        author: "T. E. Hulme",
        archetype: "surprising",
        season: "autumn",
        lines: [
            "A touch of cold in the Autumn night—",
            "I walked abroad,",
            "And saw the ruddy moon lean over a hedge",
            "Like a red-faced farmer.",
            "I did not speak to him, but nodded,",
            "And round about stood the wistful stars",
            "With faces like white town children."
        ]
    },
    {
        id: "dickinson-route",
        title: "A Route of Evanescence",
        author: "Emily Dickinson",
        archetype: "surprising",
        season: "spring",
        lines: [
            "A Route of Evanescence",
            "With a revolving Wheel –",
            "A Resonance of Emerald –",
            "A Rush of Cochineal –",
            "And every Blossom on the Bush",
            "Adjusts its tumbled Head –",
            "The mail from Tunis, probably,",
            "An easy Morning’s Ride –"
        ]
    }
];

/**
 * Pick a poem matching the chosen style, skipping recently used ones.
 * If everything has been used lately, repeats are allowed rather than failing.
 * Poems matching the season/weather setting get picked more often.
 */
export function pickPoem(pool, filter, season, excludeIds) {
    const byFilter = pool.filter(p => filter === 'all' || p.archetype === filter);
    const styled = byFilter.length ? byFilter : pool;
    const unused = styled.filter(p => !excludeIds.includes(p.id));
    const candidates = unused.length ? unused : styled;
    const weighted = candidates.flatMap(p => (p.season === season ? [p, p, p] : [p]));
    return weighted[Math.floor(Math.random() * weighted.length)];
}
