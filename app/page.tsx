"use client";
import AuthGate from "./components/AuthGate";
import FinanceApp from "./components/FinanceApp";

export default function Page() {
  return (
    <AuthGate>
      <FinanceApp />
    </AuthGate>
  );
}