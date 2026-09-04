import { orchestrate } from "./index.ts";
import type { ListingRow } from "./types.ts";
import { spawnSync } from "node:child_process";

type AgentResult = {
  listings?: ListingRow[];
  response?: string;
};

const userMessageQueue = new Map<string, Promise<string>>();

async function sendTypingIndicator(userId: string): Promise<void> {
  const presentation = JSON.stringify({
    context: { typing: true },
  });
  spawnSync(
    "pnpm",
    [
      "openclaw",
      "message",
      "send",
      "--channel",
      "whatsapp",
      "--target",
      userId,
      "--presentation",
      presentation,
      "--silent",
    ],
    { encoding: "utf8" },
  );
}

export async function onWhatsAppMessage(message: string, userId: string) {
  const normalizedMessage = extractLatestUserQuery(message);
  const prev = userMessageQueue.get(userId) ?? Promise.resolve("");
  const next = prev
    .catch(() => "")
    .then(async () => {
      await sendTypingIndicator(userId);
      try {
        const result = await orchestrate(normalizedMessage, userId);
        return formatForWhatsApp(result as AgentResult | string, normalizedMessage);
      } catch (err) {
        console.error("Orchestration error:", err);
        return "Sorry, I hit an issue. Please try again.";
      }
    });

  userMessageQueue.set(userId, next);
  return await next.finally(() => {
    if (userMessageQueue.get(userId) === next) {
      userMessageQueue.delete(userId);
    }
  });
}

export function formatForWhatsApp(result: AgentResult | string, question = ""): string {
  const withQuestion = (agent: string) => {
    const scoped = getAgentScopedQuestion(agent, question);
    return scoped ? `${agent} reply for "${scoped}"` : `${agent} reply`;
  };

  if (typeof result === "string") {
    const sectionParts = result.split(/\n\s*---\s*\n/);
    const formattedSections = sectionParts.map((section) => {
      const trimmed = section.trim();
      const headerMatch = trimmed.match(/^Reply from (.+? Agent):\s*/i);
      const agentName = headerMatch?.[1]?.trim() ?? "";
      const body = headerMatch ? trimmed.slice(headerMatch[0].length).trim() : trimmed;

      if (!agentName && /pending email drafts? (is|are) saved under id/i.test(trimmed)) {
        const idsMatch = trimmed.match(/IDs?:\s*(.+?)\./i);
        if (idsMatch?.[1]) {
          return `✉️ Pending drafts saved: ${idsMatch[1]}\nUse: check draft`;
        }
        const idMatch = trimmed.match(/ID\s+([A-Za-z0-9_-]+)/i);
        const draftId = idMatch?.[1] ?? "<draftId>";
        return `✉️ Pending draft saved: ${draftId}\nUse: approve email ${draftId}\nOr: delete draft ${draftId}`;
      }

      const listingLines = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- ") && line.includes(" | "));

      const toBasicCards = () =>
        listingLines.slice(0, 5).map((line) => {
          const parts = line.replace(/^\s*-\s*/, "").split(" | ");
          if (parts.length < 4) return line;
          const [addressCity, price, bedsBaths, sqft] = parts;
          return `🏠 *${addressCity}*\n💰 ${price} | 🛏 ${bedsBaths} | 📐 ${sqft}`;
        });

      if (agentName === "Property Search Agent") {
        if (!listingLines.length) {
          return `${withQuestion("Property Search Agent")}\n${body}`;
        }
        const cards = toBasicCards();
        return [withQuestion("Property Search Agent"), cards.join("\n\n")].join("\n");
      }

      if (agentName === "Recommendation Agent") {
        if (!listingLines.length) {
          return `${withQuestion("Recommendation Agent")}\n📌 ${body}`;
        }
        const cards = listingLines.slice(0, 5).map((line) => {
          const parts = line.replace(/^\s*-\s*/, "").split(" | ");
          if (parts.length < 4) return line;
          const [addressCity, price, bedsBaths, sqft, score, comp, delta] = parts;
          const metrics = [score, comp, delta].filter(Boolean).join(" | ");
          return `🏠 *${addressCity}*\n💰 ${price} | 🛏 ${bedsBaths} | 📐 ${sqft}${metrics ? `\n📌 ${metrics}` : ""}`;
        });
        return [withQuestion("Recommendation Agent"), cards.join("\n\n")].join("\n");
      }

      if (agentName === "Market Stats Agent") {
        const lines = body
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => (line.startsWith("- ") ? `📊 ${line.slice(2)}` : line));
        lines.unshift(withQuestion("Market Stats Agent"));
        return lines.join("\n");
      }

      if (agentName === "RAG Agent") {
        return `${withQuestion("RAG Agent")}\n📘 ${body}`;
      }

      if (agentName === "Email Draft Agent") {
        return `${withQuestion("Email Draft Agent")}\n✉️ ${body || "WIP"}`;
      }

      if (agentName) {
        return `${withQuestion(agentName)}\n${body}`;
      }

      return trimmed;
    });

    return capForWhatsApp(formattedSections.join("\n\n---\n\n"));
  }
  if (result.listings) {
    const text = result.listings
      .slice(0, 5)
      .map(
        (l) =>
          `🏠 *${l.L_Address}, ${l.L_City}*\n` +
          ` 💰 $${l.price.toLocaleString()} | 🛏 ${l.beds}bd/${l.baths}ba | 📐 ${l.sqft} sqft\n` +
          ` 📅 ${l.DaysOnMarket} days on market`,
      )
      .join("\n\n");
    return capForWhatsApp(text);
  }
  return capForWhatsApp(result.response || "There are no returned results.");
}

function getAgentScopedQuestion(agent: string, question: string): string {
  const q = normalizeDisplayQuestion(question);
  if (!q) return "";

  const clauses = q
    .split(/,\s*|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!clauses.length) return q;

  const findClause = (pattern: RegExp) => clauses.find((c) => pattern.test(c));

  if (agent === "Property Search Agent") {
    return cleanClause(
      findClause(/\b(find|show|homes?|houses?|condos?|properties|listings?)\b/i) ??
      clauses[0] ??
      q,
    );
  }

  if (agent === "Market Stats Agent") {
    return cleanClause(
      findClause(/\b(market|trend|rising|falling|price|prices|dom|days on market|inventory|list-to-close)\b/i) ??
      q,
    );
  }

  if (agent === "Recommendation Agent") {
    return cleanClause(findClause(/\b(similar|recommend|comparable|comps)\b/i) ?? q);
  }

  if (agent === "RAG Agent") {
    return cleanClause(findClause(/\b(explain|what is|what does|define|meaning)\b/i) ?? q);
  }

  if (agent === "Email Draft Agent") {
    return cleanClause(findClause(/\b(email|draft|summary|send)\b/i) ?? q);
  }

  return cleanClause(q);
}

function normalizeDisplayQuestion(input: string): string {
  return input.trim().replace(/^\[[^\]]+\]\s*/i, "").trim();
}

function cleanClause(input: string): string {
  const stripped = input
    .trim()
    .replace(/^(and|also|then)\s+/i, "")
    .trim();
  if (!stripped) return "";
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function capForWhatsApp(text: string, maxChars = 3000): string {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  return `${clipped}\n\n...`;
}

function extractLatestUserQuery(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cleanedLines = lines.filter(
    (line) =>
      !/^(use:|reply with:|or:|sources:|pending drafts?:|draft id:)/i.test(line),
  );

  const controlLine = cleanedLines.find((line) =>
    /^(?:\[[^\]]+\]\s*)?(approve email|delete draft|check draft)\b/i.test(line),
  );
  if (controlLine) {
    return controlLine.replace(/^\[[^\]]+\]\s*/i, "").trim();
  }

  const candidatePool = cleanedLines.length ? cleanedLines : lines;
  const candidate = candidatePool.length ? candidatePool[candidatePool.length - 1] : message.trim();
  return candidate.replace(/^\[[^\]]+\]\s*/i, "").trim();
}
