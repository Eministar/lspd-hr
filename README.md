<div align="center">

  <!-- Schöner Header-Banner (Capsule Render) — Navy + Gold, LSPD-Vibe -->
  <img
    width="100%"
    src="https://capsule-render.vercel.app/api?type=waving&height=200&color=0:061426,100:0a1e38&text=LSPD%20HR%20Dashboard&fontSize=34&fontColor=d4af37&fontAlignY=36&desc=Personalverwaltung%20%E2%80%94%20Los%20Santos%20Police%20Department&descSize=12&descAlignY=58&section=header"
    alt="LSPD HR Dashboard — Banner"
  />

  <br /><br />

  <sub>🚓 🚔 ✨ <strong> Los Santos Police Department</strong> · HR & Personal · FiveM-Ready ✨ 🚔 🚓</sub>

  <br /><br />

  <p>
    <a href="https://lspd-demo.star-dev.xyz/">
      <img src="https://img.shields.io/badge/🌐_LIVE--DEMO-059669?style=for-the-badge&logo=googlechrome&logoColor=white&labelColor=064e3b" alt="Live Demo" />
    </a>
    <a href="https://nextjs.org/">
      <img src="https://img.shields.io/badge/⚡_Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
    </a>
    <a href="https://www.typescriptlang.org/">
      <img src="https://img.shields.io/badge/🛡️_TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    </a>
    <a href="https://www.prisma.io/">
      <img src="https://img.shields.io/badge/◆_Prisma%207-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
    </a>
  </p>

  <b>Modernes Web-Dashboard</b> für Ränge, Roster, Beförderungen, Ausbildungen &amp; Protokoll —<br />
  gebaut mit Liebe zum Detail und einem dunkel-goldenen <i>Premium-UI</i>.

  <p>
    <a href="https://lspd-demo.star-dev.xyz/"><b>➡️ Demo in neuem Tab öffnen</b></a>
  </p>

  <p><sub>🔒 Nur Demo-Instanz — keine echten Dienstdaten</sub></p>

  <br />

  <a href="https://github.com/Eministar/lspd-hr">
    <img src="https://img.shields.io/badge/⭐_Star_auf_GitHub-0d1b2a?style=for-the-badge&logo=github&logoColor=gold" alt="GitHub Repository" />
  </a>

</div>

---

## 🎯 · Live · Demo

### 🌐 Einsteigen

| | |
| :-- | :-- |
| **Link** | [**lspd-demo.star-dev.xyz**](https://lspd-demo.star-dev.xyz/) |
| **Was?** | Interaktiv — Dashboard, Roster, Admin, UI ausprobieren |

### 🔑 Demo-Login

| | |
| :--: | :-- |


*Dieselben Werte legt `prisma/seed.ts` an — lokal identisch, wenn du seetest.*

> ⚠️ **Hinweis · Demo**  
> Daten können **jederzeit zurückgesetzt** werden. Bitte **keine echten** Passwörter oder realen personenbezogenen Daten eintragen — es ist **nur eine Spiel-/Vorschau-Umgebung**.

---

## ✨ · Features · im Überblick

| | Feature | Kurz & knackig |
| :-: | --- | --- |
| 📊 | **Dashboard** | Kennzahlen, Dienstbereitschaft, Ausbildung, Ränge, Aktivität |
| 👮 | **Officer-Roster** | Suche, Filter, Units, Bearbeiten |
| 🗃️ | **Gekündigte Officers** | eigener Bereich außerhalb der normalen Officer-Liste |
| ⬆️ | **Beförderungen** | Listen, Historie, Workflows |
| ⬇️ | **Degradierungen** | Listen & Übersicht |
| 🏁 | **Kündigungen** | inkl. Wiedereingliederung |
| 📝 | **Notizen** | global & pro Officer |
| ✅ | **Aufgaben** | Academy, HR und SRU |
| ⚙️ | **Admin** | Ränge, Ausbildungen, Units, Benutzergruppen, Benutzer, Einstellungen |
| 📜 | **Protokoll** | Audit-Log |
| 🎨 | **UI** | Dark-Mode, Glaspanele, **Gold-Akzente** · responsive |
| 🔐 | **Auth** | JWT, Rollen und frei konfigurierbare Benutzergruppen |
| 🌐 | **Öffentliche Ansicht** | `/public/officers` zeigt Officers ohne Anmeldung im Lesemodus |

---

## 🛠️ · Tech-Stack

```
┌─────────────────────────────────────────────────────┐
│  Next.js  ·  TypeScript  ·  Tailwind 4              │
│  Prisma 7  ·  MySQL/MariaDB  ·  Radix  ·  Motion    │
└─────────────────────────────────────────────────────┘
```

| | |
| :--: | :-- |
| **⚡ Framework** | [Next.js](https://nextjs.org/) (App Router) |
| **📦 Sprache** | TypeScript |
| **🎨 Styling** | Tailwind CSS 4 |
| **🗄️ Datenbank** | **MySQL / MariaDB** |
| **🧩 ORM** | Prisma 7 |
| **🔒 Auth** | JWT · httpOnly-Cookie |
| **🧱 UI-Toolkit** | Radix UI, Framer Motion, Lucide |

---

## 🚀 · Lokal starten

### Checkliste

- ✔️ **Node.js 22** (laut `engines` in `package.json`)
- ✔️ **MySQL** oder **MariaDB** erreichbar

### 🧰 Setup-Befehle

```bash
# 📥 Repository klonen
git clone https://github.com/Eministar/lspd-hr.git
cd lspd-hr

# 📦 Dependencies
npm install

# 🔧 .env anlegen (siehe .env.example)
cp .env.example .env
# → DATABASE_URL + JWT_SECRET setzen

# 🗃️ Prisma + Datenbank
npm run db:generate
npm run db:push
npm run db:seed

# ▶️ Dev-Server
npm run dev
```

Dann: **http://localhost:3000** — Login nach Seed: `admin` / `admin123`

### 📋 Scripts

| Befehl | ✨ Wofür? |
| --- | --- |
| `npm run dev` | DB sync + Prisma + Next (Dev) |
| `npm run build` | Produktions-Build |
| `npm run db:push` | Schema an die DB |
| `npm run db:seed` | Admin, Ränge, Ausbildungen, Units, Benutzergruppen |
| `npm run db:studio` | Prisma Studio |

---

## 🛡️ · Sicherheit (Production)

- 🔐 **`JWT_SECRET`** — stark, zufällig, **nur** in `.env`, **niemals** im Repo
- 🚫 **Default-Login** `admin` / `admin123` in Produktion **deaktivieren** oder ersetzen
- ☁️ Secrets nur per **Hostinger / PaaS / Secret-Manager**

---

## 💜 · Credits

| | |
| :--: | :--: |
| **Handcrafted with** | **&lt;3** |
| **by** | **[Eministar](https://github.com/Eministar)** |

> *Für LSPD- & FiveM-Roleplay-Setups, die Wert auf klare Struktur legen.*

➡️ **Repo:** [github.com/Eministar/lspd-hr](https://github.com/Eministar/lspd-hr)  
➡️ **Demo:** [lspd-demo.star-dev.xyz](https://lspd-demo.star-dev.xyz/)

<div align="center">
  <br />
  <img
    width="100%"
    src="https://capsule-render.vercel.app/api?type=waving&height=120&color=0:0a1e38,100:061426&section=footer&text=Thanks%20for%20visiting!&fontSize=20&fontColor=d4af37&fontAlignY=78&desc=Stay%20safe%20%E2%80%94%20LSPD%20RP&descSize=10&descAlignY=52&reversal=true"
    alt="Footer Banner"
  />
  <p><sub>⭐ Wenn’s hilft — gerne ein Stern auf GitHub ⭐</sub></p>
</div>
