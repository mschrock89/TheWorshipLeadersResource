import { createContext, ReactNode, useContext } from "react";

export type MinistrySelectionContextValue = {
  selectedMinistryType: string | null;
  setSelectedMinistryType: (ministryType: string) => void;
};

const MinistrySelectionContext = createContext<MinistrySelectionContextValue | undefined>(
  undefined,
);

export function MinistrySelectionProvider({
  value,
  children,
}: {
  value: MinistrySelectionContextValue;
  children: ReactNode;
}) {
  return (
    <MinistrySelectionContext.Provider value={value}>
      {children}
    </MinistrySelectionContext.Provider>
  );
}

export function useMinistrySelectionOptional() {
  return useContext(MinistrySelectionContext);
}

export function useMinistrySelection() {
  const ctx = useMinistrySelectionOptional();
  if (!ctx) {
    throw new Error("useMinistrySelection must be used within MinistrySelectionProvider");
  }
  return ctx;
}
