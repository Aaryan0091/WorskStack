# WorkStack

The intelligent bookmark and activity management platform for productive teams.

---

## Overview

WorkStack is a modern bookmark management and browsing activity platform designed for professionals who need to organize, search, and share web resources efficiently. Powered by AI-driven semantic search and intelligent auto-tagging, WorkStack transforms how teams discover and leverage their collective web knowledge.

### Why WorkStack?

- **AI-Powered Discovery**: Find content by meaning, not just keywords. Search "ferrari" and get results for "car"
- **Seamless Collaboration**: Share curated collections with your team via secure, shareable links
- **Activity Intelligence**: Understand browsing patterns with built-in time tracking and session analytics
- **Privacy-First**: Guest mode available. No account required to try. Your data, your control.

---

## Features

### 💾 Intelligent Bookmark Management

| Feature | Description |
|---------|-------------|
| **Smart Capture** | Save any URL with auto-fetched titles, descriptions, and metadata |
| **AI Auto-Tagging** | Automatically assigns relevant tags using Groq AI |
| **Collections** | Organize bookmarks across folders into shareable collections |
| **Bulk Operations** | Import, export, and manage multiple bookmarks efficiently |
| **Full-Text Search** | Instant search across titles, URLs, descriptions, and tags |

### 🧠 Semantic Search Engine

```typescript
// Traditional search: "ferrari" → finds "ferrari"
// Semantic search:  "ferrari" → finds "ferrari", "car", "sports car", "italian automotive"
```

- **Multi-Mode Search**: All, Semantic AI, Tags, and Name search modes
- **Real-Time Results**: Instant feedback for non-AI modes
- **Context-Aware**: Understands meaning and relationships between concepts

### 📊 Browsing Activity Tracking

- **Cross-Platform Extension**: Chrome, Edge, and Brave support
- **Session Persistence**: Restore your browsing session across devices
- **Time Analytics**: Daily, weekly, and monthly activity summaries
- **Privacy Controls**: Pause/resume tracking with one click

### 👥 Collaboration & Sharing

- **Public Collections**: Share curated resources via unique URLs
- **Guest Access**: View shared collections without signing up
- **Real-Time Sync**: Changes sync instantly across all devices

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- A Supabase project (free tier works)
- A Groq API key (for AI features)

### Installation

```bash
# Clone the repository
git clone https://github.com/Aaryan0091/WorskStack.git
cd WorkStack

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Groq AI (Required for AI features)
GROQ_API_KEY=your-groq-api-key

# Optional
NEXT_PUBLIC_EXTENSION_ID=your-extension-id
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS, CSS Variables |
| **Backend** | Next.js API Routes, Supabase |
| **Database** | PostgreSQL (via Supabase) |
| **Auth** | Supabase Auth |
| **AI** | Groq API for semantic search & tagging |
| **Extension** | Chrome Extension Manifest V3 |

---

## Roadmap

- [ ] Mobile apps (iOS & Android)
- [ ] Team workspaces with role-based access
- [ ] Browser extensions for Safari & Firefox
- [ ] API for third-party integrations
- [ ] Advanced analytics dashboard
- [ ] Dark mode system-wide

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License.

## Support

For questions or feedback, please open an issue on GitHub.
