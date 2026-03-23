"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiBase } from "../components/api";
import { getAuthToken } from "../components/auth";

type BootstrapStatus = {
  setupRequired: boolean;
};

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.replace("/dashboard");
      return;
    }

    async function routeByBootstrap() {
      try {
        const response = await fetch(`${apiBase()}/api/v1/auth/bootstrap-status`, { cache: "no-store" });
        if (!response.ok) {
          router.replace("/sign-in");
          return;
        }

        const body = (await response.json()) as BootstrapStatus;
        router.replace(body.setupRequired ? "/setup" : "/sign-in");
      } catch {
        router.replace("/sign-in");
      }
    }

    void routeByBootstrap();
  }, [router]);

  return <main className="app-background text-sm text-slate-600">Routing...</main>;
}
