export type PvmListItem = {
  collection: string;
  name: string;
  company: string;
  context: string;
};

export type PvmState = {
  name: string;
  company: string;
  description: string;
  taglines: unknown[];
  positioning: { type: string; content: unknown }[];
};

function headers(apiKey: string) {
  return { "x-api-key": apiKey, "Content-Type": "application/json" };
}

export async function listPvms(
  baseUrl: string,
  apiKey: string
): Promise<PvmListItem[]> {
  const res = await fetch(`${baseUrl}/api/v1/pvms`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Positio ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.pvms ?? [];
}

export async function getPvmState(
  baseUrl: string,
  apiKey: string,
  collection: string
): Promise<PvmState> {
  const res = await fetch(`${baseUrl}/api/v1/pvms/${collection}/state`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`Positio ${res.status}: ${res.statusText}`);
  return res.json();
}
