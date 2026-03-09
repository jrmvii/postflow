"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  connectLinkedIn,
  getSocialAccounts,
  disconnectAccount,
} from "@/lib/actions/social-accounts";

type SocialAccount = {
  id: string;
  platform: string;
  accountType: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
};

export default function AccountsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const success = searchParams.get("success");
  const error = searchParams.get("error");

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const result = await getSocialAccounts();
    if (Array.isArray(result)) setAccounts(result as any);
  }

  async function handleConnect() {
    setLoading(true);
    const result = await connectLinkedIn();
    if (result && "redirectUrl" in result) {
      window.location.href = result.redirectUrl as string;
    } else if (result && "error" in result) {
      setMessage(result.error);
      setLoading(false);
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm("Déconnecter ce compte ?")) return;
    const result = await disconnectAccount(accountId);
    if (result && "error" in result) {
      setMessage(result.error as string);
    } else {
      loadAccounts();
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Comptes sociaux</h2>
        <button
          onClick={handleConnect}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Connexion..." : "Connecter LinkedIn"}
        </button>
      </div>

      {success === "connected" && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">
          Compte LinkedIn connecté avec succès
        </div>
      )}

      {(error || message) && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error || message}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-gray-500">Aucun compte connecté</p>
          <p className="text-sm text-gray-400 mt-1">
            Connectez votre profil LinkedIn pour commencer à publier
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center gap-3">
                {account.avatarUrl && (
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full"
                  />
                )}
                <div>
                  <p className="font-medium text-sm">{account.displayName}</p>
                  <p className="text-xs text-gray-500">
                    {account.platform} ·{" "}
                    {account.accountType === "COMPANY_PAGE"
                      ? "Page entreprise"
                      : "Profil personnel"}
                  </p>
                  {account.tokenExpiresAt && (
                    <p className="text-xs text-gray-400">
                      Expire le{" "}
                      {new Date(account.tokenExpiresAt).toLocaleDateString(
                        "fr-FR"
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    account.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {account.isActive ? "Actif" : "Inactif"}
                </span>
                <button
                  onClick={() => handleDisconnect(account.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Déconnecter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
