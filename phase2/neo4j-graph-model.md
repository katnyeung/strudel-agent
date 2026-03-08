# Neo4j Graph Model — Musical Memory

The agent's long-term musical memory. Tracks which patterns evolved from which,
what listeners liked, which moves improve ratings, and how vibes map to skills.

## Design Principles

1. **Patterns are the center** — everything connects through patterns
2. **Relationships carry the knowledge** — the properties on edges matter more than nodes
3. **Graph answers relationship questions** — "what works together?" not "what happened when?"
4. **Neon is source of truth** — Neo4j is rebuilt from Neon data during daily review

---

## Node Types

### Pattern
The core entity. A snapshot of Strudel code at a point in time.

```cypher
(:Pattern {
  id:          String,    // UUID from Neon evolutions table
  code:        String,    // full Strudel code (setcps + all $voices)
  skill_id:    String,    // "lofi-dj", "jazz-improv", etc.
  voice_count: Int,       // number of $name: voices in the code
  voices:      [String],  // ["kick", "bass", "chord", "hat"]
  has_melody:  Boolean,   // true if $melody: or $arp: present
  has_chords:  Boolean,   // true if $chord: or $keys: or $pad: present
  has_bass:    Boolean,
  bpm:         Float,     // extracted from setcps()
  key:         String,    // detected key if possible ("C", "Eb", etc.)
  scale:       String,    // detected scale if possible ("minor", "dorian")
  rating:      Float,     // explicit rating (1-5) or inferred quality score
  play_secs:   Int,       // how long this pattern played before being changed
  created_at:  DateTime
})
```

**Why these properties?** The `has_*` booleans and `voices` array let us query
"what instruments were present when ratings were high?" without parsing code.
`voice_count` tracks complexity. `bpm`/`key`/`scale` enable musical analysis.

### Skill
A genre template that produces patterns.

```cypher
(:Skill {
  id:       String,    // "lofi-dj", "jazz-improv"
  name:     String,    // "Lo-fi DJ"
  version:  Int,       // current version number
  icon:     String     // "🎧"
})
```

### Voice
An individual instrument voice extracted from a pattern.
This is where the **"D3 F#2 evolved with kick"** insight lives.

```cypher
(:Voice {
  id:        String,    // pattern_id + "_" + voice_name
  name:      String,    // "kick", "bass", "chord", "hat", "melody"
  code:      String,    // just this voice's code line
  type:      String,    // "drums", "bass", "harmony", "melody", "texture"
  synth:     String,    // "sawtooth", "triangle", "sine", "bd", "hh"
  notes:     [String],  // ["D3", "F#2"] — extracted note values
  has_lpf:   Boolean,
  has_room:  Boolean,
  has_delay: Boolean,
  has_swing: Boolean,
  gain:      Float      // extracted gain value
})
```

**Why Voice nodes?** This is the key insight from your question.
When Voice nodes exist, we can ask:
- "Which bass notes pair well with which kick patterns?"
- "When note('D3 F#2') appears in a chord voice, what drum patterns get rated 5?"
- "What synth type (sawtooth vs triangle) produces better bass ratings?"

### Move
An evolution action. Represents a type of musical change.

```cypher
(:Move {
  type:        String,    // "add_voice", "modify_filter", "change_chord",
                          // "add_effect", "remove_voice", "change_rhythm"
  description: String,    // "Added filter sweep with LFO to bass"
  category:    String     // "bold" or "subtle"
})
```

### Vibe
A natural language mood/atmosphere description.

```cypher
(:Vibe {
  text:     String,    // "rainy café in tokyo"
  mood:     String,    // "melancholy", "chill", "dark", "uplifting"
  energy:   String,    // "low", "medium", "high"
  keywords: [String]   // ["rainy", "café", "tokyo"]
})
```

### Session
A streaming session (one WebSocket connection lifecycle).

```cypher
(:Session {
  id:         String,    // UUID
  started_at: DateTime,
  ended_at:   DateTime,
  duration_m: Int,       // total minutes
  evolutions: Int,       // total evolution count
  avg_rating: Float      // average rating across session
})
```

### DailyReview
Record of what the daily review found and decided.

```cypher
(:DailyReview {
  id:           String,
  review_date:  Date,
  skill_id:     String,
  patterns_reviewed: Int,
  lessons:      [String],  // ["Filter sweeps below 800Hz rated higher"]
  skill_version_before: Int,
  skill_version_after:  Int
})
```

---

## Relationships

### Pattern Evolution Chain

```cypher
// Core evolution lineage
(p1:Pattern)-[:EVOLVED_TO {
  reason:    String,    // "Added ghost snare for groove"
  move_type: String,    // "add_voice"
  rating_delta: Float,  // p2.rating - p1.rating (can be negative)
  session_id: String
}]->(p2:Pattern)
```

**Power query**: Find the most successful evolution paths
```cypher
MATCH path = (start:Pattern)-[:EVOLVED_TO*1..5]->(end:Pattern)
WHERE start.rating <= 2 AND end.rating >= 4
RETURN path, length(path) as steps,
       end.rating - start.rating as improvement
ORDER BY improvement DESC, steps ASC
LIMIT 10
```

### Pattern ↔ Skill

```cypher
(s:Skill)-[:PRODUCED]->(p:Pattern)
```

**Power query**: Which skill produces the highest-rated patterns?
```cypher
MATCH (s:Skill)-[:PRODUCED]->(p:Pattern)
WHERE p.rating IS NOT NULL
RETURN s.id, avg(p.rating) as avg_rating, count(p) as total
ORDER BY avg_rating DESC
```

### Pattern ↔ Voice (decomposition)

```cypher
(p:Pattern)-[:CONTAINS]->(v:Voice)
```

**Power query**: What bass notes pair with high-rated patterns?
```cypher
MATCH (p:Pattern)-[:CONTAINS]->(v:Voice)
WHERE v.type = 'bass' AND p.rating >= 4
RETURN v.notes, v.synth, count(*) as times_rated_high, avg(p.rating)
ORDER BY times_rated_high DESC
LIMIT 20
```

**Power query**: YOUR EXACT QUESTION — "note('D3 F#2') evolved with which drums get liked?"
```cypher
MATCH (p:Pattern)-[:CONTAINS]->(chord:Voice {type: 'harmony'})
WHERE 'D3' IN chord.notes AND 'F#2' IN chord.notes
MATCH (p)-[:CONTAINS]->(drum:Voice {type: 'drums'})
WHERE p.rating >= 4
RETURN drum.code, drum.name, count(*) as paired_count, avg(p.rating) as avg_rating
ORDER BY avg_rating DESC
```

### Voice ↔ Voice (what works together)

```cypher
(v1:Voice)-[:PAIRED_WITH {
  pattern_count: Int,    // how many patterns had both
  avg_rating:    Float,  // average rating when paired
  skill_id:      String  // which genre context
}]->(v2:Voice)
```

**Power query**: Best voice combinations for lo-fi
```cypher
MATCH (v1:Voice)-[pw:PAIRED_WITH {skill_id: 'lofi-dj'}]->(v2:Voice)
WHERE pw.avg_rating >= 4
RETURN v1.name, v1.code, v2.name, v2.code, pw.avg_rating
ORDER BY pw.avg_rating DESC
LIMIT 10
```

### Move Effectiveness

```cypher
(m:Move)-[:APPLIED_IN {
  rating_before: Float,
  rating_after:  Float,
  rating_delta:  Float,
  pattern_id:    String
}]->(p:Pattern)
```

**Power query**: Which evolution moves consistently improve ratings?
```cypher
MATCH (m:Move)-[a:APPLIED_IN]->(p:Pattern)
WHERE a.rating_delta > 0
RETURN m.type, m.description,
       count(*) as times_improved,
       avg(a.rating_delta) as avg_improvement,
       collect(DISTINCT p.skill_id) as genres
ORDER BY times_improved DESC
LIMIT 15
```

**Power query**: Which moves work for lo-fi but NOT techno?
```cypher
MATCH (m:Move)-[a:APPLIED_IN]->(p:Pattern {skill_id: 'lofi-dj'})
WHERE a.rating_delta > 0
WITH m, avg(a.rating_delta) as lofi_improvement
OPTIONAL MATCH (m)-[a2:APPLIED_IN]->(p2:Pattern {skill_id: 'minimal-techno'})
WITH m, lofi_improvement, avg(a2.rating_delta) as techno_improvement
WHERE techno_improvement IS NULL OR techno_improvement < 0
RETURN m.type, m.description, lofi_improvement
ORDER BY lofi_improvement DESC
```

### Vibe Mapping

```cypher
(v:Vibe)-[:TRIGGERED {
  session_id: String,
  pattern_id: String,   // the pattern that was playing/generated
  rating:     Float     // did user like the result?
}]->(s:Skill)
```

**Power query**: "rainy" vibes — which skill gets the best response?
```cypher
MATCH (v:Vibe)-[t:TRIGGERED]->(s:Skill)
WHERE 'rainy' IN v.keywords AND t.rating >= 4
RETURN s.id, s.name, count(*) as times, avg(t.rating)
ORDER BY avg(t.rating) DESC
```

### Session Tracking

```cypher
(session:Session)-[:PLAYED]->(p:Pattern)
(session:Session)-[:USED_SKILL]->(s:Skill)
```

### Daily Review Links

```cypher
(dr:DailyReview)-[:REVIEWED]->(p:Pattern)
(dr:DailyReview)-[:IMPROVED]->(s:Skill)
```

---

## Indexes & Constraints

```cypher
// Uniqueness constraints
CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT voice_id IF NOT EXISTS FOR (v:Voice) REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT review_id IF NOT EXISTS FOR (d:DailyReview) REQUIRE d.id IS UNIQUE;

// Performance indexes
CREATE INDEX pattern_skill IF NOT EXISTS FOR (p:Pattern) ON (p.skill_id);
CREATE INDEX pattern_rating IF NOT EXISTS FOR (p:Pattern) ON (p.rating);
CREATE INDEX pattern_date IF NOT EXISTS FOR (p:Pattern) ON (p.created_at);
CREATE INDEX voice_type IF NOT EXISTS FOR (v:Voice) ON (v.type);
CREATE INDEX voice_name IF NOT EXISTS FOR (v:Voice) ON (v.name);
CREATE INDEX move_type IF NOT EXISTS FOR (m:Move) ON (m.type);
CREATE INDEX vibe_mood IF NOT EXISTS FOR (v:Vibe) ON (v.mood);

// Full-text index for vibe search
CREATE FULLTEXT INDEX vibe_text IF NOT EXISTS FOR (v:Vibe) ON EACH [v.text];
```

---

## Data Flow: How Nodes Get Created

### During Live Stream (via Neon → Neo4j sync)
1. Evolution tick fires → row written to Neon `evolutions` table
2. Daily review reads Neon rows → creates/updates Neo4j:
   - Creates Pattern node (with extracted properties)
   - Creates Voice nodes (by parsing $name: lines from code)
   - Creates EVOLVED_TO relationship between consecutive patterns
   - Creates/merges Move node for the move_type
   - Creates APPLIED_IN relationship
   - Creates CONTAINS relationships (Pattern → Voice)
   - Computes and creates PAIRED_WITH relationships between voices

### During Daily Review
1. Pull 24h of evolutions from Neon
2. For each evolution → create Pattern, Voice, relationship nodes
3. Compute PAIRED_WITH aggregates (batch — not per-evolution)
4. Run "best moves" and "best pairings" queries
5. Feed results to LLM → extract lessons
6. Write lessons to skill `rules.md` → create DailyReview node

---

## Voice Extraction Logic

Parse a pattern's code to create Voice nodes:

```
setcps(0.325)
$kick: sound("bd:1").beat("0,4,6,10,14",16).bank("RolandTR808").gain(0.6)
$bass: note("C2 ~ C2 ~ Eb2 ~ F2 ~").sound("triangle").slow(2).lpf(350).gain(0.4)
$chord: note("D3 F#2 A3 C#4").sound("sawtooth").slow(4).lpf(1000).room(0.6).gain(0.3)
```

Produces:
- Voice {name: "kick", type: "drums", synth: "bd", notes: [], gain: 0.6}
- Voice {name: "bass", type: "bass", notes: ["C2","Eb2","F2"], synth: "triangle", gain: 0.4}
- Voice {name: "chord", type: "harmony", notes: ["D3","F#2","A3","C#4"], synth: "sawtooth", gain: 0.3}

Voice type classification:
- "drums" → name matches: kick, bd, snare, sd, hat, hh, clap, cp, rim, perc, oh, break
- "bass" → name matches: bass, sub, drone
- "harmony" → name matches: chord, keys, pad, rhodes
- "melody" → name matches: melody, arp, lead
- "texture" → everything else

---

## Key Queries for the Daily Review Agent

### 1. "What worked today?"
```cypher
MATCH (p:Pattern)
WHERE p.created_at > datetime() - duration('P1D')
  AND p.rating >= 4
RETURN p.skill_id, p.code, p.rating, p.voices, p.voice_count
ORDER BY p.rating DESC
LIMIT 10
```

### 2. "What failed today?"
```cypher
MATCH (p:Pattern)
WHERE p.created_at > datetime() - duration('P1D')
  AND (p.rating <= 2 OR p.play_secs < 30)
RETURN p.skill_id, p.code, p.rating, p.play_secs
ORDER BY p.rating ASC, p.play_secs ASC
LIMIT 10
```

### 3. "Best evolution moves this week"
```cypher
MATCH (m:Move)-[a:APPLIED_IN]->(p:Pattern)
WHERE p.created_at > datetime() - duration('P7D')
  AND a.rating_delta > 0
RETURN m.type, m.description,
       count(*) as successes,
       avg(a.rating_delta) as avg_boost
ORDER BY successes DESC
LIMIT 10
```

### 4. "Cross-genre discoveries"
```cypher
MATCH (v1:Voice)<-[:CONTAINS]-(p1:Pattern {skill_id: $skill1})
MATCH (v2:Voice)<-[:CONTAINS]-(p2:Pattern {skill_id: $skill2})
WHERE v1.code = v2.code AND p1.rating >= 4 AND p2.rating >= 4
RETURN v1.name, v1.code, p1.skill_id, p2.skill_id
```

### 5. "Agent self-improvement: what should I try next?"
```cypher
// Find moves that have been tried few times but had good results
MATCH (m:Move)-[a:APPLIED_IN]->(p:Pattern {skill_id: $skillId})
WITH m, count(a) as attempts, avg(a.rating_delta) as avg_delta
WHERE attempts < 5 AND avg_delta > 0.5
RETURN m.type, m.description, attempts, avg_delta
ORDER BY avg_delta DESC
```

---

## Scaling Notes

- **~1,440 Pattern nodes/day** (one per minute)
- **~5,000 Voice nodes/day** (avg 3.5 voices per pattern)
- **~43,000 Pattern nodes/month** — well within Neo4j Aura free tier
- PAIRED_WITH is computed daily (not per-evolution) to avoid O(n²) explosion
- Old patterns (>90 days) can be pruned to keep graph focused:
  ```cypher
  MATCH (p:Pattern)
  WHERE p.created_at < datetime() - duration('P90D')
    AND p.rating < 4
  DETACH DELETE p
  ```
  Keep highly-rated patterns forever — they're the learned knowledge.
