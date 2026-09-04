import { orchestrate } from "./index.ts";
import type { ListingRow } from "./types.ts";
import { spawnSync } from "node:child_process";

type AgentResult = {
  listings?: ListingRow[];
  response?: string;
};

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
  await sendTypingIndicator(userId);
  try {
    const result = await orchestrate(message, userId);
    return formatForWhatsApp(result as AgentResult | string, message);
  } catch (err) {
    console.error("Orchestration error:", err);
    return "Sorry, I hit an issue. Please try again.";
  }
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

    return formattedSections.join("\n\n---\n\n");
  }
  if (result.listings) {
    return result.listings
      .slice(0, 5)
      .map(
        (l) =>
          `🏠 *${l.L_Address}, ${l.L_City}*\n` +
          ` 💰 $${l.price.toLocaleString()} | 🛏 ${l.beds}bd/${l.baths}ba | 📐 ${l.sqft} sqft\n` +
          ` 📅 ${l.DaysOnMarket} days on market`,
      )
      .join("\n\n");
  }
  return result.response || "There are no returned results.";
}

function getAgentScopedQuestion(agent: string, question: string): string {
  const q = question.trim();
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

function cleanClause(input: string): string {
  const stripped = input
    .trim()
    .replace(/^(and|also|then)\s+/i, "")
    .trim();
  if (!stripped) return "";
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
