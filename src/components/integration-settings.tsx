"use client";

import { useState, useEffect } from "react";
import {
  getIntegrationConfig,
  saveIntegrationConfig,
  testPositioConnection,
  testVigieConnection,
  saveVigieSourceGroups,
} from "@/lib/actions/integrations";

type PvmItem = { collection: string; name: string; company: string; context?: string };

export function IntegrationSettings() {
  const [positioUrl, setPositioUrl] = useState("");
  const [positioApiKey, setPositioApiKey] = useState("");
  const [positioCollection, setPositioCollection] = useState("");
  const [positioPvms, setPositioPvms] = useState<PvmItem[]>([]);
  const [positioStatus, setPositioStatus] = useState<
    "idle" | "ok" | "error"
  >("idle");
  const [positioMessage, setPositioMessage] = useState("");

  const [vigieUrl, setVigieUrl] = useState("");
  const [vigieApiKey, setVigieApiKey] = useState("");
  const [vigieCollection, setVigieCollection] = useState("");
  const [vigieAvailableCategories, setVigieAvailableCategories] = useState<string[]>([]);
  const [vigieActiveGroups, setVigieActiveGroups] = useState<string[]>([]);
  const [vigieStatus, setVigieStatus] = useState<"idle" | "ok" | "error">(
    "idle"
  );
  const [vigieMessage, setVigieMessage] = useState("");
  const [savingGroups, setSavingGroups] = useState(false);
  const [groupsMessage, setGroupsMessage] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    getIntegrationConfig().then((config) => {
      if (config && !("error" in config)) {
        setPositioUrl(config.positioUrl);
        setPositioApiKey(config.positioApiKey);
        setPositioCollection(config.positioCollection);
        setVigieUrl(config.vigieUrl);
        setVigieApiKey(config.vigieApiKey);
        setVigieCollection(config.vigieCollection);
      }
    });
  }, []);

  async function handleTestPositio() {
    if (!positioUrl || !positioApiKey) {
      setPositioStatus("error");
      setPositioMessage("URL et clé API requises");
      return;
    }
    setPositioStatus("idle");
    setPositioMessage("Test en cours...");
    const result = await testPositioConnection({
      url: positioUrl,
      apiKey: positioApiKey,
    });
    if (result && "error" in result) {
      setPositioStatus("error");
      setPositioMessage(result.error as string);
    } else if (result && "pvms" in result) {
      setPositioStatus("ok");
      const pvms = result.pvms as PvmItem[];
      setPositioPvms(pvms);
      setPositioMessage(`${pvms.length} PVM(s) trouvé(s)`);
      if (pvms.length === 1) {
        setPositioCollection(pvms[0].collection);
      } else if (pvms.length > 1 && !positioCollection) {
        setPositioCollection(pvms[0].collection);
      }
    }
  }

  async function handleTestVigie() {
    if (!vigieUrl) {
      setVigieStatus("error");
      setVigieMessage("URL requise");
      return;
    }
    setVigieStatus("idle");
    setVigieMessage("Test en cours...");
    const result = await testVigieConnection({
      url: vigieUrl,
      apiKey: vigieApiKey,
    });
    if (result && "error" in result) {
      setVigieStatus("error");
      setVigieMessage(result.error as string);
    } else if (result && "success" in result) {
      setVigieStatus("ok");
      const r = result as any;
      setVigieCollection(r.collection as string);
      setVigieAvailableCategories(r.availableCategories || []);
      setVigieActiveGroups(r.activeGroups || []);
      setVigieMessage(
        `${r.articleCount} articles — collection « ${r.collection} »`
      );
    }
  }

  function toggleGroup(cat: string) {
    setVigieActiveGroups((prev) =>
      prev.includes(cat) ? prev.filter((g) => g !== cat) : [...prev, cat]
    );
  }

  async function handleSaveGroups() {
    setSavingGroups(true);
    setGroupsMessage("");
    const result = await saveVigieSourceGroups(vigieActiveGroups);
    setSavingGroups(false);
    if (result && "error" in result) {
      setGroupsMessage(result.error as string);
    } else {
      setGroupsMessage("Groupes enregistrés");
      setTimeout(() => setGroupsMessage(""), 3000);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");
    const formData = new FormData();
    formData.set("positioUrl", positioUrl);
    formData.set("positioApiKey", positioApiKey);
    formData.set("positioCollection", positioCollection);
    formData.set("vigieUrl", vigieUrl);
    formData.set("vigieApiKey", vigieApiKey);
    formData.set("vigieCollection", vigieCollection);
    const result = await saveIntegrationConfig(formData);
    setSaving(false);
    if (result && "error" in result) {
      setSaveMessage(result.error as string);
    } else {
      setSaveMessage("Enregistré");
      setTimeout(() => setSaveMessage(""), 3000);
    }
  }

  const statusDot = (status: "idle" | "ok" | "error") =>
    status === "ok"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-gray-300";

  const selectedPvm = positioPvms.find(
    (p) => p.collection === positioCollection
  );

  return (
    <div className="space-y-6">
      <h3 className="font-semibold">Intégrations</h3>

      {/* Positio */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(positioStatus)}`}
          />
          <h4 className="text-sm font-medium">Positio (cadre produit)</h4>
        </div>
        <div className="space-y-2">
          <input
            type="url"
            value={positioUrl}
            onChange={(e) => setPositioUrl(e.target.value)}
            placeholder="https://positio.example.com"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={positioApiKey}
            onChange={(e) => setPositioApiKey(e.target.value)}
            placeholder="Clé API"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestPositio}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Tester
            </button>
            {positioMessage && (
              <span
                className={`text-xs ${positioStatus === "error" ? "text-red-600" : positioStatus === "ok" ? "text-green-600" : "text-gray-500"}`}
              >
                {positioMessage}
              </span>
            )}
          </div>
          {positioPvms.length === 1 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-700">
                {positioPvms[0].name} ({positioPvms[0].company})
              </span>
            </div>
          )}
          {positioPvms.length > 1 && (
            <select
              value={positioCollection}
              onChange={(e) => setPositioCollection(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {positioPvms.map((pvm) => (
                <option key={pvm.collection} value={pvm.collection}>
                  {pvm.name} ({pvm.company})
                </option>
              ))}
            </select>
          )}
          {positioPvms.length === 0 && positioCollection && (
            <input
              type="text"
              value={positioCollection}
              onChange={(e) => setPositioCollection(e.target.value)}
              placeholder="Collection PVM"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {selectedPvm?.context && (
            <p className="text-xs text-gray-500 italic">{selectedPvm.context}</p>
          )}
        </div>
      </div>

      {/* Vigie */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(vigieStatus)}`}
          />
          <h4 className="text-sm font-medium">Vigie (veille stratégique)</h4>
        </div>
        <div className="space-y-2">
          <input
            type="url"
            value={vigieUrl}
            onChange={(e) => setVigieUrl(e.target.value)}
            placeholder="https://vigie.example.com"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={vigieApiKey}
            onChange={(e) => setVigieApiKey(e.target.value)}
            placeholder="Clé API (optionnel)"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestVigie}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Tester
            </button>
            {vigieMessage && (
              <span
                className={`text-xs ${vigieStatus === "error" ? "text-red-600" : vigieStatus === "ok" ? "text-green-600" : "text-gray-500"}`}
              >
                {vigieMessage}
              </span>
            )}
          </div>
          {/* Collection auto-découverte */}
          {vigieCollection && vigieStatus === "ok" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm text-green-700">
                  Collection : {vigieCollection}
                </span>
              </div>
              {/* Groupes de sources (toggles) */}
              {vigieAvailableCategories.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-gray-600">
                    Groupes de sources :
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {vigieAvailableCategories.map((cat) => {
                      const isActive = vigieActiveGroups.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleGroup(cat)}
                          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                            isActive
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-gray-300 text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveGroups}
                      disabled={savingGroups}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {savingGroups ? "Enregistrement..." : "Enregistrer les groupes"}
                    </button>
                    {groupsMessage && (
                      <span className="text-xs text-green-600">{groupsMessage}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer les intégrations"}
        </button>
        {saveMessage && (
          <span className="text-sm text-green-600">{saveMessage}</span>
        )}
      </div>
    </div>
  );
}
