# Genealogy Tree - Family History Management Software

A cross-platform desktop application for managing family genealogy and lineage records, built with **Tauri 2.0 + React 19 + TypeScript**.

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/License-Apache--2.0-green)

## Features

### Core Functionality
- **Family Tree Visualization** - Interactive tree view of family lineage
- **Member Management** - Add, edit, and view family member information
- **Relation Tags** - Customizable relationship labels with color coding
- **Data Import/Export** - Support for CSV and Excel import

### User Roles
| Role | Permissions |
|------|-------------|
| **Administrator** | Full access: manage members, edit family info, manage tags, system settings |
| **Regular User** | View-only access: view family members, view family info |

### Key Capabilities
- **Cross-Platform** - Runs on macOS, Windows, and Linux
- **Local-First** - Data stored locally, no cloud dependency
- **Multi-Device Access** - HTTP server (port 8080) for LAN browser access
- **Desktop Integration** - System tray, auto-start support

## Screenshots

> Note: Screenshots to be added by developer.
> Recommended screenshots:
> 
> 
> 
> 
> - Tag management

- Home page with family statistics
![Home Page](screenshots/home-page.png)
- Tree visualization view
![Tree Page](screenshots/tree-view.png)
- Member list view
![Members Page](screenshots/member-list.png)
- Family info settings
![family info](screenshots/family-info.png)
- Genealogy Navigation
![genealogy navigation](screenshots/tree-1.png)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | React 19.1.0 |
| Language | TypeScript 5.8.3 |
| Build Tool | Vite 7.0.4 |
| Desktop Framework | Tauri 2.x |
| Backend Language | Rust |
| HTTP Server | Axum 0.7 |
| Package Manager | pnpm 10.11.0 |
| Database | SQLite 3 |
| Visualization | react-d3-tree 3.6.6 |

## Project Structure

```
genealogy-tree/
├── src/                      # React frontend source
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Main app component
│   ├── pages/               # Page components
│   │   ├── LoginPage.tsx   # Login/Register
│   │   ├── HomePage.tsx    # Dashboard
│   │   ├── TreePage.tsx     # Family tree & members
│   │   └── SettingsPage.tsx # Configuration
│   ├── components/           # Reusable components
│   ├── api/                 # API client
│   └── stores/              # State management
│
├── src-tauri/              # Tauri/Rust backend
│   ├── src/
│   │   ├── lib.rs          # Rust entry point
│   │   ├── api/            # HTTP API handlers
│   │   ├── auth.rs         # JWT authentication
│   │   ├── db.rs           # Database initialization
│   │   └── models.rs       # Data models
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
│
├── package.json            # NPM dependencies
├── vite.config.ts          # Vite configuration
└── tsconfig.json           # TypeScript configuration
```

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 10.11.0+
- Rust 1.70+
- Tauri CLI 2.x

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Start Tauri desktop app (in another terminal)
pnpm tauri dev
```

### Build

```bash
# Build frontend
pnpm build

# Build Tauri app
pnpm tauri build
```

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/health` | Health check | No |
| POST | `/api/auth/register` | Register account | No |
| POST | `/api/auth/login` | Login | No |
| GET | `/api/users/me` | Get current user | Yes |
| GET | `/api/admin/users` | List all users | Admin |
| GET/POST | `/api/members` | List/Create members | - |
| GET/PUT/DELETE | `/api/members/:id` | Member CRUD | - |
| GET/POST | `/api/member-relations` | Relations | - |
| GET/POST | `/api/relation-tags` | Tags | - |

## Configuration

### Database Location

The database is stored in the application data directory:
- **macOS**: `~/Library/Application Support/com.genealogy-tree/.genealogy.db`
- **Linux**: `~/.config/genealogy-tree/.genealogy.db`
- **Windows**: `%APPDATA%\com.genealogy-tree\.genealogy.db`

### HTTP Server

The desktop app runs an HTTP server on port 8080 for local network access:
```
http://localhost:8080          # Local access
http://<your-ip>:8080         # LAN access
```

## License

Apache License 2.0
