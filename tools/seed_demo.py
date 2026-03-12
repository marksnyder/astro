#!/usr/bin/env python3
"""Seed script: clears all user content and populates demo data for both universes.

Home universe  (id=2) — career improvement, wellness, education
Work universe  (id=1) — software engineering daily work
"""

import os
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DB_PATH = ROOT / "data" / "astro.db"
DOCUMENTS_DIR = ROOT / "documents"
IMAGES_DIR = ROOT / "data" / "images"
FEED_FILES_DIR = ROOT / "data" / "feed_files"
CHROMA_DIR = ROOT / "data" / "chroma"


def clear_all():
    """Wipe all user content from the database and filesystem."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")

    tables_to_clear = [
        "feed_artifacts",
        "feeds",
        "action_item_links",
        "action_items",
        "markdown_images",
        "markdowns",
        "links",
        "document_meta",
        "categories",
    ]
    for t in tables_to_clear:
        conn.execute(f"DELETE FROM {t}")
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ({})".format(
        ",".join(f"'{t}'" for t in tables_to_clear)
    ))
    conn.commit()
    conn.close()

    # Filesystem cleanup
    if DOCUMENTS_DIR.exists():
        shutil.rmtree(DOCUMENTS_DIR)
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

    if IMAGES_DIR.exists():
        shutil.rmtree(IMAGES_DIR)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    if FEED_FILES_DIR.exists():
        shutil.rmtree(FEED_FILES_DIR)
    FEED_FILES_DIR.mkdir(parents=True, exist_ok=True)

    if CHROMA_DIR.exists():
        shutil.rmtree(CHROMA_DIR)

    print("All content cleared.")


def seed():
    """Populate both universes with rich demo data."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row

    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    def ts(days_ago=0, hours_ago=0):
        return (now - timedelta(days=days_ago, hours=hours_ago)).isoformat()

    # ── WORK universe (id=1) ─────────────────────────────────────────────

    WORK = 1
    HOME = 2

    # ── Categories ────────────────────────────────────────────────────────

    work_cats = {}
    home_cats = {}

    work_category_defs = [
        ("Architecture & Design", None, "🏗️"),
        ("Code Review", None, "🔍"),
        ("DevOps & CI/CD", None, "🚀"),
        ("Sprint Planning", None, "📋"),
        ("Documentation", None, "📝"),
        ("Reference & Learning", None, "📚"),
        ("Meeting Notes", None, "🗓️"),
        ("Debugging", None, "🐛"),
    ]
    for name, parent, emoji in work_category_defs:
        cur = conn.execute(
            "INSERT INTO categories (name, parent_id, universe_id, emoji) VALUES (?,?,?,?)",
            (name, parent, WORK, emoji),
        )
        work_cats[name] = cur.lastrowid

    home_category_defs = [
        ("Career Development", None, "💼"),
        ("Resume & Portfolio", "Career Development", "📄"),
        ("Interviewing", "Career Development", "🎯"),
        ("Networking", "Career Development", "🤝"),
        ("Wellness", None, "🧘"),
        ("Fitness", "Wellness", "💪"),
        ("Nutrition", "Wellness", "🥗"),
        ("Mental Health", "Wellness", "🧠"),
        ("Education", None, "🎓"),
        ("Online Courses", "Education", "💻"),
        ("Reading List", "Education", "📖"),
        ("Study Techniques", "Education", "✏️"),
    ]
    for name, parent_name, emoji in home_category_defs:
        parent_id = home_cats.get(parent_name)
        cur = conn.execute(
            "INSERT INTO categories (name, parent_id, universe_id, emoji) VALUES (?,?,?,?)",
            (name, parent_id, HOME, emoji),
        )
        home_cats[name] = cur.lastrowid

    conn.commit()

    # ── WORK Markdowns ─────────────────────────────────────────────────────

    work_markdowns = [
        (
            "API Design Guidelines",
            work_cats["Architecture & Design"],
            ts(30),
            """## REST API Design Standards

### URL Structure
- Use nouns, not verbs: `/users/{id}` not `/getUser`
- Plural resource names: `/orders` not `/order`
- Nested resources for relationships: `/users/{id}/orders`
- Query params for filtering: `/orders?status=pending&limit=25`

### HTTP Methods
| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Read | Yes |
| POST | Create | No |
| PUT | Full update | Yes |
| PATCH | Partial update | No |
| DELETE | Remove | Yes |

### Response Codes
- `200` — Success
- `201` — Created (POST)
- `204` — No Content (DELETE)
- `400` — Bad Request (validation)
- `401` — Unauthorized
- `404` — Not Found
- `409` — Conflict (duplicate)
- `429` — Rate Limited
- `500` — Server Error

### Pagination
Always paginate list endpoints. Return:
```json
{
  "data": [...],
  "total": 142,
  "page": 1,
  "page_size": 25,
  "has_more": true
}
```

### Versioning
Use URL-based versioning: `/api/v1/resource`""",
        ),
        (
            "Git Workflow & Branch Strategy",
            work_cats["Code Review"],
            ts(25),
            """## Git Branching Strategy

### Branch Naming
- `feature/JIRA-123-short-description`
- `bugfix/JIRA-456-fix-login-crash`
- `hotfix/PROD-789-patch-security`
- `release/v2.4.0`

### Commit Message Format
```
type(scope): short description

Longer explanation if needed.

Refs: JIRA-123
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

### PR Checklist
- [ ] Tests pass locally
- [ ] No linter warnings
- [ ] Documentation updated
- [ ] Changelog entry added
- [ ] Reviewed own diff before requesting review
- [ ] Linked to Jira ticket
- [ ] Screenshots for UI changes

### Code Review Etiquette
1. Review within 4 hours of request
2. Be specific — suggest code, don't just say "fix this"
3. Approve with comments if minor nits only
4. Prefix comments: `nit:`, `question:`, `suggestion:`, `blocking:`""",
        ),
        (
            "Docker & Container Cheatsheet",
            work_cats["DevOps & CI/CD"],
            ts(20),
            """## Docker Quick Reference

### Essential Commands
```bash
docker build -t myapp:latest .
docker run -d -p 8080:80 --name myapp myapp:latest
docker compose up -d
docker compose logs -f --tail=100
docker exec -it myapp /bin/sh
docker system prune -af  # reclaim space
```

### Dockerfile Best Practices
- Use multi-stage builds to reduce image size
- Pin base image versions: `python:3.12-slim` not `python:latest`
- Combine RUN commands to reduce layers
- Copy requirements first for better cache hits
- Run as non-root user
- Use `.dockerignore` to exclude unnecessary files

### Docker Compose Patterns
```yaml
services:
  api:
    build: .
    ports: ["8080:80"]
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 5s
      retries: 3
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
```

### Debugging Containers
- `docker logs <container>` — view stdout/stderr
- `docker inspect <container>` — full config dump
- `docker stats` — live resource usage
- `docker diff <container>` — filesystem changes""",
        ),
        (
            "Sprint Retro — March 2026",
            work_cats["Sprint Planning"],
            ts(3),
            """## Sprint 24 Retrospective

**Sprint Goal:** Ship user notification preferences and performance improvements

### What went well
- Notification preferences shipped 2 days early
- Page load time reduced by 40% after lazy-loading refactor
- Zero P1 bugs in production this sprint
- Pair programming sessions helped onboard new team member

### What could be improved
- Flaky tests in CI blocked merges 3 times this sprint
- Requirements for notification channels changed mid-sprint
- Standup is running over 15 minutes consistently

### Action Items
1. **Fix flaky tests** — dedicate 1 day next sprint to stabilize test suite
2. **Requirements freeze** — no scope changes after sprint planning
3. **Standup timer** — 90 seconds per person, parking lot for discussions
4. **Tech debt budget** — reserve 20% of sprint capacity for tech debt

### Metrics
| Metric | Target | Actual |
|--------|--------|--------|
| Velocity | 34 pts | 38 pts |
| Bug escape rate | <5% | 2% |
| PR cycle time | <24h | 18h |
| Sprint goal met | Yes | Yes |""",
        ),
        (
            "System Architecture Overview",
            work_cats["Architecture & Design"],
            ts(45),
            """## Platform Architecture

### High-Level Components
```
┌─────────────┐     ┌──────────┐     ┌─────────────┐
│  React SPA  │────▶│ API GW   │────▶│ Microservices│
│  (Vite)     │     │ (Kong)   │     │  (FastAPI)   │
└─────────────┘     └──────────┘     └──────┬──────┘
                                            │
                    ┌───────────────────────┬┘
                    ▼                       ▼
              ┌──────────┐          ┌──────────────┐
              │PostgreSQL│          │ Redis Cache   │
              │  (RDS)   │          │ (ElastiCache) │
              └──────────┘          └──────────────┘
```

### Service Boundaries
- **Auth Service** — JWT tokens, OAuth2, RBAC
- **User Service** — profiles, preferences, teams
- **Notification Service** — email, SMS, push, in-app
- **Search Service** — Elasticsearch, indexing pipeline
- **File Service** — S3 upload/download, image processing

### Key Decisions
1. **Event-driven** for cross-service communication (SQS + SNS)
2. **PostgreSQL** as primary datastore (ACID compliance)
3. **Redis** for session cache and rate limiting
4. **Feature flags** via LaunchDarkly for safe rollouts

### SLA Targets
- API p99 latency: < 200ms
- Uptime: 99.95%
- Recovery time objective (RTO): 15 minutes
- Recovery point objective (RPO): 1 hour""",
        ),
        (
            "Code Review Checklist",
            work_cats["Code Review"],
            ts(15),
            """## Code Review Checklist

### Correctness
- [ ] Does the code do what the ticket describes?
- [ ] Are edge cases handled (null, empty, boundary values)?
- [ ] Are error paths handled gracefully?
- [ ] Is the happy path tested?

### Security
- [ ] No hardcoded secrets or API keys
- [ ] User input is validated and sanitized
- [ ] SQL queries use parameterized statements
- [ ] Authentication/authorization checks in place
- [ ] Sensitive data not logged

### Performance
- [ ] No N+1 queries
- [ ] Database queries use appropriate indexes
- [ ] Large datasets paginated
- [ ] No unnecessary API calls in loops
- [ ] Caching considered where appropriate

### Maintainability
- [ ] Functions are small and focused (< 30 lines ideal)
- [ ] Variable names are descriptive
- [ ] No duplicated logic
- [ ] Complex logic has comments explaining *why*
- [ ] Dead code removed

### Testing
- [ ] Unit tests cover core logic
- [ ] Integration tests for API endpoints
- [ ] Edge cases have test coverage
- [ ] Tests are deterministic (no flakiness)""",
        ),
        (
            "Monitoring & Alerting Runbook",
            work_cats["DevOps & CI/CD"],
            ts(10),
            """## On-Call Runbook

### Alert: High API Latency (p99 > 500ms)
1. Check Grafana dashboard: `Platform > API Latency`
2. Identify slow endpoints in DataDog APM
3. Check database connection pool: `SELECT count(*) FROM pg_stat_activity`
4. Look for long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND duration > interval '5s'`
5. Check Redis connection: `redis-cli ping`
6. If DB-related: consider read replica failover

### Alert: Error Rate > 5%
1. Check error logs: `kubectl logs -l app=api --tail=500`
2. Check recent deployments: `kubectl rollout history deployment/api`
3. If deployment-related: `kubectl rollout undo deployment/api`
4. Check downstream dependencies (external APIs)

### Alert: Disk Space > 85%
1. Check which volumes: `df -h`
2. Prune Docker: `docker system prune -af`
3. Rotate logs: `logrotate -f /etc/logrotate.d/app`
4. Check temp files: `du -sh /tmp/*`

### Escalation Path
| Severity | Response Time | Escalation |
|----------|--------------|------------|
| P1 — Outage | 5 min | On-call → Team Lead → VP Eng |
| P2 — Degraded | 30 min | On-call → Team Lead |
| P3 — Minor | Next business day | Ticket |""",
        ),
        (
            "Python Performance Tips",
            work_cats["Reference & Learning"],
            ts(8),
            """## Python Performance Optimization

### Profiling First
Never optimize without measuring:
```python
import cProfile
cProfile.run('my_function()', sort='cumulative')

# Or use line_profiler for line-by-line
# @profile decorator + kernprof -l -v script.py
```

### Data Structure Selection
| Operation | list | set | dict |
|-----------|------|-----|------|
| Lookup | O(n) | O(1) | O(1) |
| Insert | O(1)* | O(1) | O(1) |
| Delete | O(n) | O(1) | O(1) |

Use `set` for membership tests, `dict` for key-value lookups.

### Common Wins
1. **Generator expressions** over list comprehensions for large data
2. **`collections.defaultdict`** instead of manual key checking
3. **`functools.lru_cache`** for expensive pure functions
4. **`str.join()`** over string concatenation in loops
5. **`asyncio`** for I/O-bound tasks (API calls, file I/O)
6. **Batch DB operations** — one INSERT with executemany vs N inserts

### Async Patterns
```python
import asyncio
import aiohttp

async def fetch_all(urls):
    async with aiohttp.ClientSession() as session:
        tasks = [session.get(url) for url in urls]
        return await asyncio.gather(*tasks)
```

### Memory Tips
- Use `__slots__` for classes with many instances
- Use `array` module for typed arrays instead of lists
- Stream large files instead of reading into memory""",
        ),
        (
            "Weekly 1:1 Notes Template",
            work_cats["Meeting Notes"],
            ts(1),
            """## 1:1 Notes — Week of March 9, 2026

### Status Updates
- Notification preferences feature merged and deployed
- Started spike on WebSocket migration for real-time updates
- Reviewed and approved 4 PRs this week

### Blockers
- Need access to staging environment for WebSocket testing
- Waiting on design mockups for settings page redesign

### Discussion Topics
- Career growth: interested in taking on tech lead responsibilities
- Want to present at next engineering all-hands on our caching strategy
- Training budget: looking at advanced Kubernetes certification

### Action Items from Last Week
- [x] Write ADR for WebSocket vs SSE decision
- [x] Pair with QA on test automation framework
- [ ] Schedule knowledge-sharing session on distributed tracing

### Goals for Next Week
- Complete WebSocket proof of concept
- Start tech spec for real-time collaboration feature
- Attend AWS re:Invent virtual session on serverless""",
        ),
        (
            "Debugging Tough Production Issues",
            work_cats["Debugging"],
            ts(5),
            """## Production Debugging Playbook

### Step 1: Gather Information
- When did the issue start? Check deploy timeline.
- Who is affected? All users or specific cohort?
- What changed? Recent deploys, config changes, infra updates.

### Step 2: Reproduce
- Can you reproduce locally?
- Can you reproduce in staging?
- What's the minimal reproduction case?

### Step 3: Common Debugging Tools
```bash
# Kubernetes logs
kubectl logs -l app=api --since=1h | grep ERROR

# Database slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

# Network debugging
curl -v -w "@curl-format.txt" https://api.example.com/health

# Memory/CPU on pod
kubectl top pods -l app=api
```

### Step 4: Common Root Causes
1. **Connection pool exhaustion** — check max connections, connection leaks
2. **Memory leak** — heap dump, check for growing caches
3. **Race condition** — look for shared mutable state, missing locks
4. **External dependency timeout** — check third-party status pages
5. **Data migration issue** — verify schema matches expectations

### Step 5: Fix & Verify
- Write a regression test before fixing
- Deploy fix to staging first
- Monitor error rates for 30 minutes post-deploy
- Write incident postmortem""",
        ),
    ]

    for title, cat_id, created, body in work_markdowns:
        conn.execute(
            "INSERT INTO markdowns (title, body, category_id, universe_id, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (title, body, cat_id, WORK, created, created),
        )

    # ── HOME Markdowns ─────────────────────────────────────────────────────

    home_markdowns = [
        (
            "Resume Power Words & Structure",
            home_cats["Resume & Portfolio"],
            ts(20),
            """## Resume Best Practices

### Structure (Reverse Chronological)
1. **Contact Info** — name, email, phone, LinkedIn, GitHub
2. **Summary** — 2-3 sentences, tailored to the role
3. **Experience** — most recent first, bullet points with metrics
4. **Skills** — relevant technical and soft skills
5. **Education** — degrees, certifications
6. **Projects** — if early career, showcase personal projects

### Action Verbs That Stand Out
**Leadership:** Spearheaded, Orchestrated, Championed, Mentored
**Technical:** Architected, Engineered, Optimized, Automated
**Results:** Accelerated, Increased, Reduced, Delivered, Achieved

### Quantify Everything
- ❌ "Improved application performance"
- ✅ "Reduced API response time by 40%, saving $12K/month in infrastructure costs"
- ❌ "Led a team"
- ✅ "Led a cross-functional team of 8 engineers across 3 time zones"

### Tailoring Tips
- Mirror keywords from the job description
- Reorder bullet points to match their priorities
- Adjust your summary for each application
- Remove irrelevant experience — keep to 1-2 pages""",
        ),
        (
            "Interview Preparation Framework",
            home_cats["Interviewing"],
            ts(18),
            """## Interview Prep Checklist

### Before the Interview
- [ ] Research the company: mission, recent news, product
- [ ] Review the job description line by line
- [ ] Prepare 5 STAR stories (Situation, Task, Action, Result)
- [ ] Practice coding on whiteboard/paper (no IDE)
- [ ] Prepare 3-5 thoughtful questions to ask them

### STAR Stories to Prepare
1. **Leadership/Influence** — time you led without authority
2. **Conflict resolution** — disagreement with a teammate
3. **Technical challenge** — hardest bug or architecture decision
4. **Failure & learning** — something that went wrong, what you learned
5. **Impact** — biggest measurable impact you've had

### System Design Interview Tips
1. **Clarify requirements** — ask about scale, constraints, priorities
2. **Start with high-level design** — boxes and arrows
3. **Deep dive on 1-2 components** — show depth
4. **Discuss trade-offs** — there's no single right answer
5. **Address scalability** — caching, sharding, CDN, queues

### Salary Negotiation
- Research market rate: Levels.fyi, Glassdoor, Blind
- Never give a number first
- Negotiate total comp: base + equity + bonus + benefits
- Get offers in writing before deciding
- It's okay to ask for time: "I'd like 48 hours to consider"  """,
        ),
        (
            "Professional Networking Strategy",
            home_cats["Networking"],
            ts(15),
            """## Networking Game Plan

### Weekly Habits
- [ ] Post 1 piece of content on LinkedIn (article, insight, project update)
- [ ] Comment meaningfully on 5 posts from people in your field
- [ ] Send 2 connection requests with personalized messages
- [ ] Attend 1 virtual or local meetup/month

### Templates

**Connection Request:**
> Hi [Name], I saw your talk on [topic] at [event] and really enjoyed your perspective on [specific point]. I'm working on similar problems at [company] and would love to connect.

**Follow-up After Meeting:**
> Great meeting you at [event]! I really enjoyed our conversation about [topic]. I'd love to continue the discussion — would you be up for a 15-minute virtual coffee sometime next week?

**Asking for an Informational Interview:**
> Hi [Name], I'm exploring opportunities in [area] and I really admire the work your team is doing at [company]. Would you have 20 minutes for a quick chat? I'd love to learn about your experience.

### Build in Public
- Share what you're learning (blog posts, tweets)
- Open-source a side project
- Give talks at local meetups
- Mentor someone junior""",
        ),
        (
            "Morning Routine for Peak Performance",
            home_cats["Wellness"],
            ts(12),
            """## My Morning Routine (6:00 AM - 8:00 AM)

### Phase 1: Wake Up (6:00 - 6:15)
- No phone for first 15 minutes
- Glass of water with lemon
- 5 minutes of stretching

### Phase 2: Mindfulness (6:15 - 6:45)
- 10 minutes meditation (Headspace or Waking Up app)
- 10 minutes journaling — gratitude + intentions for the day
- 10 minutes reading (non-fiction, physical book)

### Phase 3: Movement (6:45 - 7:30)
- Mon/Wed/Fri: Strength training (45 min)
- Tue/Thu: Zone 2 cardio (30-40 min jogging or cycling)
- Sat: Yoga or hiking
- Sun: Rest or light walk

### Phase 4: Fuel (7:30 - 8:00)
- High-protein breakfast: eggs + vegetables + whole grain toast
- Black coffee (limit to 2 cups before noon)
- Prep lunch if not meal-prepped

### Why This Works
- Delayed phone = less cortisol spike
- Meditation = improved focus and reduced anxiety
- Morning exercise = better energy all day
- Journaling = clarity on priorities

### Tracking
Use a habit tracker app. Aim for 80% consistency, not perfection.""",
        ),
        (
            "Weekly Workout Program",
            home_cats["Fitness"],
            ts(10),
            """## 4-Day Strength + Cardio Program

### Monday — Upper Body Push
| Exercise | Sets x Reps | Notes |
|----------|-------------|-------|
| Bench Press | 4 x 8 | Progressive overload |
| Overhead Press | 3 x 10 | Strict form |
| Incline DB Press | 3 x 12 | Slow negatives |
| Lateral Raises | 3 x 15 | Light weight |
| Tricep Pushdowns | 3 x 12 | |
| Face Pulls | 3 x 15 | Shoulder health |

### Tuesday — Cardio + Core
- 30 min Zone 2 run (conversational pace)
- 3 rounds: plank (60s), dead bugs (15/side), pallof press (12/side)

### Wednesday — Lower Body
| Exercise | Sets x Reps | Notes |
|----------|-------------|-------|
| Barbell Squat | 4 x 6 | Depth to parallel |
| Romanian Deadlift | 3 x 10 | Feel hamstrings |
| Bulgarian Split Squat | 3 x 10/leg | |
| Leg Press | 3 x 12 | |
| Calf Raises | 4 x 15 | |

### Thursday — Upper Body Pull
| Exercise | Sets x Reps | Notes |
|----------|-------------|-------|
| Pull-ups | 4 x max | Add weight if >12 |
| Barbell Row | 4 x 8 | |
| Cable Row | 3 x 12 | Squeeze at top |
| Bicep Curls | 3 x 12 | |
| Hammer Curls | 2 x 15 | |

### Friday — Active Recovery
- 30-40 min walk or light yoga
- Foam rolling (10 min)

### Progressive Overload Rules
- Add 2.5-5 lbs when hitting top of rep range for all sets
- Track every session in a training log
- Deload every 4th week (reduce volume 40%)""",
        ),
        (
            "Meal Prep Sunday Guide",
            home_cats["Nutrition"],
            ts(8),
            """## Weekly Meal Prep Blueprint

### Macro Targets (adjust to your goals)
- **Protein:** 1g per pound of body weight
- **Carbs:** 1.5-2g per pound (active days), 1g (rest days)
- **Fats:** 0.3-0.4g per pound
- **Calories:** maintenance for recomp, -300 for cut, +300 for bulk

### Sunday Prep List (2-3 hours)

**Proteins (pick 2-3):**
- 2 lbs chicken breast — season, bake at 400°F for 22 min
- 1 lb ground turkey — cook with taco seasoning
- 12 hard-boiled eggs

**Carbs (pick 2-3):**
- 4 cups rice — rice cooker
- 2 lbs sweet potatoes — cube, roast at 425°F for 25 min
- 1 lb whole wheat pasta

**Vegetables (pick 3-4):**
- 2 heads broccoli — steam or roast
- 1 bag spinach — wash, portion for salads
- 3 bell peppers — slice for snacking and stir-fry
- 1 bag green beans — blanch

### Sample Day
| Meal | Food | Protein |
|------|------|---------|
| Breakfast | 3 eggs + toast + avocado | 25g |
| Snack | Greek yogurt + berries | 20g |
| Lunch | Chicken + rice + broccoli | 45g |
| Snack | Protein shake + banana | 30g |
| Dinner | Turkey stir-fry + sweet potato | 40g |
| **Total** | | **160g** |

### Containers
- Invest in glass meal prep containers (no BPA, microwave-safe)
- Label with day of week
- Meals stay fresh 4-5 days refrigerated""",
        ),
        (
            "Meditation & Stress Management",
            home_cats["Mental Health"],
            ts(6),
            """## Stress Management Toolkit

### Daily Meditation Practice
Start with 5 minutes, build to 20:
1. Sit comfortably, close eyes
2. Focus on breath — in through nose (4 count), out through mouth (6 count)
3. When mind wanders (it will), gently return to breath
4. No judgment — wandering IS the practice

### Box Breathing (Acute Stress)
Use when feeling overwhelmed:
- Inhale 4 seconds
- Hold 4 seconds
- Exhale 4 seconds
- Hold 4 seconds
- Repeat 4-6 cycles

### Recommended Apps
- **Headspace** — guided meditation, sleep, focus
- **Waking Up** — Sam Harris, more philosophical approach
- **Calm** — sleep stories, daily calm
- **Insight Timer** — free, huge library

### Weekly Mental Health Practices
- [ ] 3 gratitude items each morning (journaling)
- [ ] Digital sunset: no screens after 9 PM
- [ ] Social connection: call a friend or family member
- [ ] Nature time: 20+ minutes outside
- [ ] Creative outlet: music, art, cooking, writing

### Sleep Hygiene
- Consistent sleep/wake time (even weekends)
- Room temperature: 65-68°F
- No caffeine after 2 PM
- Blue light filter after sunset
- 8+ hours in bed, target 7-8 hours sleep""",
        ),
        (
            "Online Learning Roadmap — 2026",
            home_cats["Online Courses"],
            ts(14),
            """## Learning Goals for 2026

### Q1: System Design & Architecture
- [ ] **Designing Data-Intensive Applications** (book by Martin Kleppmann)
- [ ] Grokking the System Design Interview (Educative)
- [ ] AWS Solutions Architect Associate certification

### Q2: Machine Learning Foundations
- [ ] Andrew Ng's Machine Learning Specialization (Coursera)
- [ ] Fast.ai Practical Deep Learning for Coders
- [ ] Build 2 ML projects for portfolio

### Q3: Leadership & Communication
- [ ] The Manager's Path by Camille Fournier (book)
- [ ] Crucial Conversations (book + practice)
- [ ] Give 2 tech talks at meetups or conferences

### Q4: Advanced Topics
- [ ] Distributed Systems course (MIT 6.824 lectures)
- [ ] Kubernetes certified administrator (CKA)
- [ ] Contribute to 2 open-source projects

### Time Budget
- **Weekdays:** 30-45 min before work (reading/courses)
- **Weekends:** 2-3 hours Saturday (projects/deep study)
- **Commute:** Podcasts and audiobooks

### Tracking
- Review progress monthly
- Adjust pace if falling behind — quality over quantity
- Share learnings: write a blog post after each major milestone""",
        ),
        (
            "Reading List — Must-Read Books",
            home_cats["Reading List"],
            ts(10),
            """## Reading List

### Career & Professional Growth
- [ ] **Deep Work** — Cal Newport
- [ ] **So Good They Can't Ignore You** — Cal Newport
- [ ] **The Staff Engineer's Path** — Tanya Reilly
- [ ] **An Elegant Puzzle** — Will Larson
- [ ] **Thinking in Systems** — Donella Meadows

### Technical (Evergreen)
- [ ] **Designing Data-Intensive Applications** — Martin Kleppmann
- [ ] **Clean Architecture** — Robert C. Martin
- [ ] **The Pragmatic Programmer** — Hunt & Thomas
- [ ] **Refactoring** — Martin Fowler
- [ ] **Site Reliability Engineering** — Google

### Wellness & Mindset
- [ ] **Atomic Habits** — James Clear
- [ ] **Why We Sleep** — Matthew Walker
- [ ] **The Body Keeps the Score** — Bessel van der Kolk
- [ ] **Breath** — James Nestor
- [ ] **Four Thousand Weeks** — Oliver Burkeman

### Finance & Life
- [ ] **The Psychology of Money** — Morgan Housel
- [ ] **Die With Zero** — Bill Perkins
- [ ] **Same as Ever** — Morgan Housel

### Reading Goal
- 2 books/month (1 professional + 1 personal growth)
- 25 pages/day minimum
- Take notes in Astro after each chapter""",
        ),
        (
            "Effective Study Techniques",
            home_cats["Study Techniques"],
            ts(5),
            """## Evidence-Based Learning Strategies

### Spaced Repetition
- Review material at increasing intervals: 1 day, 3 days, 7 days, 14 days, 30 days
- Use Anki for flashcards (especially for certifications)
- Don't re-read — test yourself instead

### Active Recall
Instead of passive reading:
1. Read a section
2. Close the book
3. Write down everything you remember
4. Check what you missed
5. Focus review on gaps

### Feynman Technique
1. Choose a concept
2. Explain it as if teaching a 12-year-old
3. Identify gaps in your explanation
4. Go back and simplify

### Pomodoro for Deep Study
- 25 minutes focused study (no phone, no notifications)
- 5 minute break (stand, stretch, water)
- After 4 pomodoros, take 15-30 minute break
- Track completed pomodoros

### Note-Taking: Cornell Method
| Cues (questions) | Notes (during lecture/reading) |
|-------------------|-------------------------------|
| What is X? | Detailed notes here... |
| Why does Y work? | More notes... |
| **Summary:** Key takeaways in your own words |

### Environment
- Dedicated study space (not your bed)
- Phone in another room
- Background music: lo-fi or classical (no lyrics)
- Good lighting and a glass of water""",
        ),
    ]

    for title, cat_id, created, body in home_markdowns:
        conn.execute(
            "INSERT INTO markdowns (title, body, category_id, universe_id, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (title, body, cat_id, HOME, created, created),
        )

    # ── WORK Links ───────────────────────────────────────────────────────

    work_links = [
        ("GitHub", "https://github.com", work_cats["Code Review"]),
        ("Stack Overflow", "https://stackoverflow.com", work_cats["Reference & Learning"]),
        ("MDN Web Docs", "https://developer.mozilla.org", work_cats["Reference & Learning"]),
        ("Hacker News", "https://news.ycombinator.com", work_cats["Reference & Learning"]),
        ("Grafana Dashboard", "https://grafana.example.com", work_cats["DevOps & CI/CD"]),
        ("Jira Board", "https://jira.example.com/board/sprint", work_cats["Sprint Planning"]),
        ("Confluence Wiki", "https://confluence.example.com", work_cats["Documentation"]),
        ("AWS Console", "https://console.aws.amazon.com", work_cats["DevOps & CI/CD"]),
        ("Figma Designs", "https://figma.com/team/designs", work_cats["Architecture & Design"]),
        ("PagerDuty", "https://pagerduty.com", work_cats["DevOps & CI/CD"]),
        ("Python Docs", "https://docs.python.org/3/", work_cats["Reference & Learning"]),
        ("FastAPI Docs", "https://fastapi.tiangolo.com", work_cats["Reference & Learning"]),
    ]

    for title, url, cat_id in work_links:
        conn.execute(
            "INSERT INTO links (title, url, category_id, universe_id, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (title, url, cat_id, WORK, ts(2), ts(2)),
        )

    # ── HOME Links ───────────────────────────────────────────────────────

    home_links = [
        ("LinkedIn", "https://linkedin.com", home_cats["Networking"]),
        ("Levels.fyi", "https://levels.fyi", home_cats["Career Development"]),
        ("Glassdoor", "https://glassdoor.com", home_cats["Interviewing"]),
        ("Blind", "https://teamblind.com", home_cats["Career Development"]),
        ("Coursera", "https://coursera.org", home_cats["Online Courses"]),
        ("Educative.io", "https://educative.io", home_cats["Online Courses"]),
        ("Khan Academy", "https://khanacademy.org", home_cats["Education"]),
        ("MIT OpenCourseWare", "https://ocw.mit.edu", home_cats["Education"]),
        ("Headspace", "https://headspace.com", home_cats["Mental Health"]),
        ("MyFitnessPal", "https://myfitnesspal.com", home_cats["Nutrition"]),
        ("Goodreads", "https://goodreads.com", home_cats["Reading List"]),
        ("Anki Flashcards", "https://apps.ankiweb.net", home_cats["Study Techniques"]),
        ("Strava", "https://strava.com", home_cats["Fitness"]),
        ("LeetCode", "https://leetcode.com", home_cats["Interviewing"]),
    ]

    for title, url, cat_id in home_links:
        conn.execute(
            "INSERT INTO links (title, url, category_id, universe_id, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (title, url, cat_id, HOME, ts(3), ts(3)),
        )

    # ── WORK Feeds ───────────────────────────────────────────────────────

    import uuid

    work_feeds = [
        ("CI/CD Pipeline Alerts", work_cats["DevOps & CI/CD"]),
        ("Security Advisories", work_cats["DevOps & CI/CD"]),
        ("Tech Blog Digest", work_cats["Reference & Learning"]),
    ]

    for title, cat_id in work_feeds:
        api_key = f"fk_{uuid.uuid4().hex}"
        conn.execute(
            "INSERT INTO feeds (title, category_id, universe_id, api_key, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (title, cat_id, WORK, api_key, ts(5), ts(5)),
        )

    # ── HOME Feeds ───────────────────────────────────────────────────────

    home_feeds = [
        ("Career Opportunities", home_cats["Career Development"]),
        ("Health & Wellness Tips", home_cats["Wellness"]),
        ("Course Recommendations", home_cats["Online Courses"]),
    ]

    for title, cat_id in home_feeds:
        api_key = f"fk_{uuid.uuid4().hex}"
        conn.execute(
            "INSERT INTO feeds (title, category_id, universe_id, api_key, pinned, created_at, updated_at) VALUES (?,?,?,?,0,?,?)",
            (title, cat_id, HOME, api_key, ts(5), ts(5)),
        )

    # ── WORK Action Items ────────────────────────────────────────────────

    def future(days):
        return (now + timedelta(days=days)).isoformat()

    work_actions = [
        ("Review PR #342 — WebSocket migration", True, False, future(3), work_cats["Code Review"]),
        ("Fix flaky integration tests in CI", True, False, None, work_cats["DevOps & CI/CD"]),
        ("Write ADR for caching strategy", False, False, future(5), work_cats["Architecture & Design"]),
        ("Update API documentation for v2 endpoints", False, False, None, work_cats["Documentation"]),
        ("Schedule knowledge-sharing on distributed tracing", False, False, None, work_cats["Meeting Notes"]),
        ("Investigate memory spike in production worker", True, False, None, work_cats["Debugging"]),
        ("Set up Datadog monitors for new microservice", False, False, None, work_cats["DevOps & CI/CD"]),
        ("Prepare sprint planning for next cycle", False, False, future(2), work_cats["Sprint Planning"]),
        ("Refactor user service to use repository pattern", False, False, ts(10), work_cats["Architecture & Design"]),
        ("Onboard new team member — pair programming sessions", False, False, None, work_cats["Meeting Notes"]),
    ]

    for title, hot, completed, due, cat_id in work_actions:
        conn.execute(
            "INSERT INTO action_items (title, hot, completed, due_date, category_id, universe_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (title, int(hot), int(completed), due, cat_id, WORK, ts(2), ts(1)),
        )

    # ── HOME Action Items ────────────────────────────────────────────────

    home_actions = [
        ("Update resume with latest project metrics", True, False, None, home_cats["Resume & Portfolio"]),
        ("Practice system design — design Twitter", False, False, None, home_cats["Interviewing"]),
        ("Complete Week 3 of ML Specialization", False, False, future(7), home_cats["Online Courses"]),
        ("Finish reading Deep Work", False, False, None, home_cats["Reading List"]),
        ("Meal prep for the week", True, False, future(1), home_cats["Nutrition"]),
        ("30 min meditation streak — day 14", False, False, None, home_cats["Mental Health"]),
        ("Send follow-up to 3 networking contacts", False, False, future(4), home_cats["Networking"]),
        ("Register for local tech meetup", False, False, None, home_cats["Networking"]),
        ("Create Anki deck for AWS certification", False, False, ts(7), home_cats["Study Techniques"]),
        ("Schedule annual physical exam", False, False, None, home_cats["Wellness"]),
        ("Write blog post about learning journey", False, False, None, home_cats["Career Development"]),
        ("Try new healthy recipe — salmon bowl", False, False, None, home_cats["Nutrition"]),
    ]

    for title, hot, completed, due, cat_id in home_actions:
        conn.execute(
            "INSERT INTO action_items (title, hot, completed, due_date, category_id, universe_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (title, int(hot), int(completed), due, cat_id, HOME, ts(3), ts(1)),
        )

    conn.commit()

    # ── Feed Artifacts ───────────────────────────────────────────────────

    # Collect feed IDs by title for referencing
    feed_rows = conn.execute("SELECT id, title FROM feeds").fetchall()
    feed_ids = {r[0]: r[1] for r in feed_rows}
    # We'll reference feeds by insertion order: 1-3 work, 4-6 home

    _artifact_data = [
        # Feed 1: CI/CD Pipeline Alerts
        (1, "Deploy v2.14.0 — Production rollout complete", ts(0, 3),
         "## Production Deploy: v2.14.0\n\n![Deployment Dashboard](https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600)\n\n**Status:** SUCCESS\n**Environment:** production\n**Duration:** 4m 32s\n**Deployed by:** github-actions\n\n### Changes Included\n- feat: WebSocket support for real-time notifications\n- fix: Connection pool leak in auth service\n- perf: Lazy-load dashboard widgets (40% faster page load)\n- chore: Upgrade Node.js to 20.11.1\n\n### Health Check\nAll endpoints responding within SLA. Error rate: 0.02%"),
        (1, "Build failed: feature/JIRA-891-user-prefs", ts(0, 8),
         "## Build Failure\n\n![Terminal Output](https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=600)\n\n**Branch:** `feature/JIRA-891-user-prefs`\n**Stage:** Unit Tests\n**Exit code:** 1\n\n### Failing Tests\n```\nFAIL src/services/user-prefs.test.ts\n  ✕ should save notification preferences (timeout 5000ms exceeded)\n  ✕ should validate email frequency enum\n  ✓ should return defaults for new users (14ms)\n```\n\n### Action Required\nAssign back to developer."),
        (1, "Staging environment recycled — new pods healthy", ts(1, 2),
         "## Staging Recycle Complete\n\n**Trigger:** Scheduled weekly recycle\n**Pods restarted:** 12\n**Downtime:** 0s (rolling restart)\n\nAll health checks passing. Staging ready for QA."),
        (1, "Docker image scan: 2 medium vulnerabilities", ts(2, 5),
         "## Image Vulnerability Scan Results\n\n**Image:** `myapp/api:v2.13.2`\n**Scanner:** Trivy v0.49.0\n\n| Severity | Count |\n|----------|-------|\n| Critical | 0 |\n| High | 0 |\n| Medium | 2 |\n| Low | 5 |\n\n### Recommendation\nUpdate base image from `python:3.12-slim-bookworm` to latest tag."),

        # Feed 2: Security Advisories
        (2, "Critical: GitHub Actions supply chain attack vector", ts(0, 6),
         "## Security Advisory: GitHub Actions Supply Chain Risk\n\n![Security](https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600)\n\n**Severity:** HIGH\n\n### Mitigation Steps\n1. Pin actions to commit SHAs instead of tags\n2. Enable Dependabot alerts for GitHub Actions\n3. Audit all third-party actions\n\nAudit complete: 3 workflows updated. No evidence of compromise."),
        (2, "Dependency update: FastAPI 0.115 patches request smuggling", ts(1, 4),
         "## Dependency Security Patch\n\n**Package:** FastAPI 0.115.0\n**Severity:** Medium\n\nHTTP request smuggling via malformed Transfer-Encoding headers. Updated requirements.txt, staging tested and verified."),
        (2, "SOC2 audit reminder: rotate service account keys", ts(3),
         "## Quarterly Key Rotation — Q1 2026\n\n**Deadline:** March 31, 2026\n\n### Service Accounts to Rotate\n- AWS IAM, GCP Service Account, Database credentials, Redis auth, Sentry API key, DataDog keys\n\nLast rotation: December 15, 2025 (within 90-day policy)."),

        # Feed 3: Tech Blog Digest
        (3, "How Stripe built idempotent APIs at scale", ts(0, 5),
         "## How Stripe Built Idempotent APIs at Scale\n\n![Code on screen](https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600)\n\nEvery mutating API call accepts an Idempotency-Key header. Keys stored in Redis with 24h TTL. Atomic check-and-set using Lua scripts.\n\n**Relevance:** High — consider for Q2 architecture planning."),
        (3, "PostgreSQL 17 performance benchmarks: 30% faster JSON", ts(1, 3),
         "## PostgreSQL 17 Performance Deep Dive\n\n| Operation | PG 16 | PG 17 | Improvement |\n|-----------|-------|-------|-------------|\n| JSONB query | 12ms | 8.4ms | 30% |\n| Parallel seq scan | 45ms | 31ms | 31% |\n\nPropose upgrading staging to PG 17 in Sprint 26."),
        (3, "The hidden cost of microservices — lessons from Segment", ts(2, 8),
         "## The Hidden Cost of Microservices\n\n![Server infrastructure](https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600)\n\nSegment moved from monolith → microservices → modular monolith. 140+ services caused operational overhead, distributed debugging pain, and data consistency bugs.\n\nBefore splitting further, ask: does this service need to scale independently?"),
        (3, "Rust in production: a 2-year retrospective from Discord", ts(4),
         "## Rust in Production: Discord's 2-Year Retrospective\n\nMemory usage down 90%, p99 latency dropped from 130ms to 5ms, zero Rust-related incidents in 2 years.\n\nGood for performance-critical services. Not ideal for rapid prototyping."),

        # Feed 4: Career Opportunities
        (4, "5 skills that will define senior engineers in 2026", ts(0, 4),
         "## 5 Skills That Will Define Senior Engineers in 2026\n\n![Career growth](https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600)\n\n1. **System Thinking** — understanding ripple effects\n2. **AI-Augmented Development** — leveraging AI tools effectively\n3. **Communication & Writing** — RFCs, ADRs, design docs\n4. **Business Acumen** — understanding revenue impact\n5. **Mentorship** — force multiplication through others"),
        (4, "Remote-friendly companies with the best engineering culture", ts(1, 6),
         "## Top Remote-Friendly Engineering Employers (2026)\n\n![Networking event](https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600)\n\n| Company | Remote Policy | Comp Range (Sr.) |\n|---------|--------------|-------------------|\n| Stripe | Remote-first | $220-350K |\n| Vercel | Remote-first | $190-280K |\n| Linear | Remote-first | $200-300K |\n| Datadog | Hybrid/Remote | $200-320K |"),
        (4, "How to negotiate a 20% raise without changing jobs", ts(3, 2),
         "## Negotiating a Raise: A Playbook\n\nDocument your wins with metrics. Research market rate. Anchor high (ask 25% to get 20%). Negotiate total comp. Get it in writing."),

        # Feed 5: Health & Wellness Tips
        (5, "The science of Zone 2 cardio: why slow running makes you faster", ts(0, 7),
         "## Zone 2 Cardio: The Most Underrated Training Method\n\n![Running outdoors](https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600)\n\nZone 2 builds mitochondrial density, improves fat oxidation, and increases cardiac output. 3-4 sessions/week, 30-60 min. 80% of training volume should be Zone 2."),
        (5, "Meal timing for desk workers: when to eat for energy", ts(1, 5),
         "## Optimal Meal Timing for Knowledge Workers\n\n![Healthy food](https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600)\n\n7 AM: protein-forward breakfast. 12:30: balanced lunch. 3:30: proactive afternoon snack. No caffeine after 2 PM. Most afternoon hunger is actually dehydration."),
        (5, "5-minute desk stretches to prevent back pain", ts(2, 3),
         "## Desk Worker Stretch Routine\n\n![Yoga and stretching](https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600)\n\nDo every 2 hours: neck rolls, chest opener, seated spinal twist, hip flexor stretch, wrist circles, standing forward fold. 5 minutes total."),
        (5, "Sleep optimization: the non-negotiable habits", ts(4),
         "## Sleep Optimization Guide\n\n![Peaceful landscape](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600)\n\nConsistent schedule. Bedroom 65-68°F. Morning sunlight. No caffeine after 2 PM. Wind-down routine 30-60 min before bed. Target 7-8 hours."),

        # Feed 6: Course Recommendations
        (6, "New: MIT Distributed Systems course — free on YouTube", ts(0, 2),
         "## MIT 6.5840 Distributed Systems (Spring 2026)\n\n![Studying](https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600)\n\n23 video lectures, 4 hands-on labs in Go. Topics: MapReduce, Raft consensus, distributed transactions, CRDTs. 2 lectures/week = 12 weeks to complete."),
        (6, "Coursera: Andrew Ng's AI for Everyone updated for 2026", ts(1, 8),
         "## AI for Everyone — Updated Course\n\n![Laptop with code](https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=600)\n\nNew modules on LLM agents, AI safety, and evaluating AI vendors. 6 hours self-paced. Free to audit, $49 for certificate."),
        (6, "AWS Solutions Architect Associate — study guide & resources", ts(2, 6),
         "## AWS SAA-C04 Certification Study Guide\n\n![Cloud infrastructure](https://images.unsplash.com/photo-1559757175-5700dde675bc?w=600)\n\n8-week study plan. Top resources: Stephane Maarek (Udemy), Tutorials Dojo (practice exams), Adrian Cantrill (deep dives). Exam: 65 questions, 130 min, $150."),
        (6, "The best free resources for learning system design", ts(5),
         "## Free System Design Resources\n\n![Books and learning](https://images.unsplash.com/photo-1513001900722-370f803f498d?w=600)\n\nMIT 6.824, Gaurav Sen (YouTube), System Design Primer (GitHub 240K stars), Engineering blogs (Stripe, Netflix, Uber). Design a system every week."),
    ]

    for feed_id_offset, title, created, markdown in _artifact_data:
        # feed_id_offset maps to the Nth feed inserted above
        actual_feed_id = conn.execute(
            "SELECT id FROM feeds ORDER BY id LIMIT 1 OFFSET ?", (feed_id_offset - 1,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO feed_artifacts (feed_id, title, content_type, markdown, created_at) VALUES (?,?,'markdown',?,?)",
            (actual_feed_id, title, markdown, created),
        )

    conn.commit()

    # Print summary
    counts = {}
    for table in ["categories", "markdowns", "links", "feeds", "action_items", "feed_artifacts"]:
        counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    conn.close()
    print(f"Seeded: {counts}")


if __name__ == "__main__":
    print("=== Clearing all content ===")
    clear_all()
    print("\n=== Seeding demo data ===")
    seed()
    print("\nDone! Restart the Astro server for changes to take effect.")
