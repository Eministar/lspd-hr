// import-db.ts
//
// Importiert einen JSON-Export (siehe db-2026-09-06T19-40-14-533Z-no-logs.json)
// zurück in die Datenbank. Reihenfolge beachtet die FK-Abhängigkeiten
// (UserGroup vor User, Rank vor Officer, Officer vor allem was auf Officer
// referenziert, …).
//
// Ausführen z. B. mit tsx:
//   npx tsx import-db.ts ./db-2026-09-06T19-40-14-533Z-no-logs.json
//
// Passe den Import-Pfad unten an euren tatsächlichen Prisma-Client-Output an
// (siehe generator-Block im schema.prisma: output = "../src/generated/prisma").

import { PrismaClient } from "../src/generated/prisma";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const filePath =
    process.argv[2] ??
    path.join(__dirname, "db-2026-09-06T19-40-14-533Z-no-logs.json");

const BATCH_SIZE = 1000;

// Felder pro Tabelle, die als Date geparst werden müssen (JSON liefert ISO-Strings).
const DATE_FIELDS: Record<string, string[]> = {
    userGroups: ["createdAt", "updatedAt"],
    users: ["lastLoginAt", "createdAt", "updatedAt"],
    units: ["createdAt", "updatedAt"],
    ranks: ["createdAt", "updatedAt"],
    trainings: ["createdAt"],
    officers: ["hireDate", "lastOnline", "createdAt", "updatedAt"],
    officerTrainings: ["createdAt", "updatedAt"],
    dutyTimeSessions: [
        "clockInAt",
        "clockOutAt",
        "activityCheckSentAt",
        "activityConfirmedAt",
        "createdAt",
        "updatedAt",
    ],
    playtimeSessions: ["startedAt", "endedAt", "lastSeenAt", "createdAt", "updatedAt"],
    absenceNotices: ["startsAt", "endsAt", "createdAt", "updatedAt"],
    promotionLogs: ["createdAt"],
    terminations: ["terminatedAt"],
    notes: ["createdAt", "updatedAt"],
    rankChangeLists: ["closedAt", "createdAt", "updatedAt"],
    rankChangeListEntries: ["executedAt", "createdAt", "updatedAt"],
    rankChangeVotes: ["createdAt", "updatedAt"],
    rankChangeEntryComments: ["createdAt", "updatedAt"],
    rankChangeEntryProposals: ["reviewedAt", "createdAt", "updatedAt"],
    rankChangeEntryHistory: ["createdAt"],
    taskLists: ["createdAt", "updatedAt"],
    tasks: ["dueDate", "completedAt", "createdAt", "updatedAt"],
    taskAssignments: ["assignedAt"],
    patrolBoards: ["startsAt", "createdAt", "updatedAt"],
    patrolUnits: ["createdAt", "updatedAt"],
    patrolAssignments: ["assignedAt"],
    badgeBlacklists: ["createdAt", "updatedAt"],
};

// Reihenfolge nach FK-Abhängigkeiten. key = Schlüssel im JSON, model = Prisma-Delegate-Name.
const IMPORT_ORDER: { key: string; model: string }[] = [
    { key: "userGroups", model: "userGroup" },
    { key: "users", model: "user" },
    { key: "units", model: "unit" },
    { key: "ranks", model: "rank" },
    { key: "trainings", model: "training" },
    { key: "officers", model: "officer" },
    { key: "officerTrainings", model: "officerTraining" },
    { key: "dutyTimeSessions", model: "dutyTimeSession" },
    { key: "playtimeSessions", model: "playtimeSession" },
    { key: "absenceNotices", model: "absenceNotice" },
    { key: "promotionLogs", model: "promotionLog" },
    { key: "terminations", model: "termination" },
    { key: "notes", model: "note" },
    { key: "changeSets", model: "changeSet" },
    { key: "changeSetSnapshots", model: "changeSetSnapshot" },
    { key: "changeSetTargets", model: "changeSetTarget" },
    { key: "changeSetEntries", model: "changeSetEntry" },
    { key: "rankChangeLists", model: "rankChangeList" },
    { key: "rankChangeListEntries", model: "rankChangeListEntry" },
    { key: "rankChangeVotes", model: "rankChangeVote" },
    { key: "rankChangeEntryComments", model: "rankChangeEntryComment" },
    { key: "rankChangeEntryProposals", model: "rankChangeEntryProposal" },
    { key: "rankChangeEntryHistory", model: "rankChangeEntryHistory" },
    { key: "systemSettings", model: "systemSetting" },
    { key: "taskLists", model: "taskList" },
    { key: "tasks", model: "task" },
    { key: "taskAssignments", model: "taskAssignment" },
    { key: "patrolBoards", model: "patrolBoard" },
    { key: "patrolUnits", model: "patrolUnit" },
    { key: "patrolAssignments", model: "patrolAssignment" },
    { key: "badgeBlacklists", model: "badgeBlacklist" },
];

function parseDates(key: string, record: Record<string, any>) {
    const fields = DATE_FIELDS[key];
    if (!fields) return record;
    const copy = { ...record };
    for (const field of fields) {
        if (copy[field]) copy[field] = new Date(copy[field]);
    }
    return copy;
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function importTable(key: string, modelName: string, rows: any[]) {
    if (!rows || rows.length === 0) {
        console.log(`⏭️  ${key}: keine Datensätze, übersprungen`);
        return;
    }

    const delegate = (prisma as any)[modelName];
    const parsed = rows.map((row) => parseDates(key, row));

    let imported = 0;
    const failures: { id: string; error: string }[] = [];

    for (const batch of chunk(parsed, BATCH_SIZE)) {
        try {
            const result = await delegate.createMany({ data: batch, skipDuplicates: true });
            imported += result.count;
        } catch (err) {
            // Ganzer Batch fehlgeschlagen (z. B. FK-Verletzung) -> einzeln versuchen.
            for (const row of batch) {
                try {
                    await delegate.upsert({ where: { id: row.id }, create: row, update: row });
                    imported++;
                } catch (rowErr) {
                    failures.push({
                        id: row.id ?? "(ohne id)",
                        error: (rowErr as Error).message.split("\n")[0],
                    });
                }
            }
        }
    }

    console.log(`✅ ${key}: ${imported}/${rows.length} importiert`);
    if (failures.length > 0) {
        console.warn(`⚠️  ${key}: ${failures.length} übersprungen:`);
        for (const f of failures.slice(0, 10)) {
            console.warn(`   - ${f.id}: ${f.error}`);
        }
        if (failures.length > 10) {
            console.warn(`   … und ${failures.length - 10} weitere`);
        }
    }
}

async function main() {
    console.log(`📂 Lese ${filePath} …`);
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    const data = json.data ?? json;

    console.log(`📦 Export vom ${json.meta?.exportedAt ?? "unbekannt"}\n`);

    for (const { key, model } of IMPORT_ORDER) {
        await importTable(key, model, data[key]);
    }

    console.log("\n🏁 Import abgeschlossen.");
}

main()
    .catch((err) => {
        console.error("❌ Import fehlgeschlagen:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });