import { createContext, ReactNode, useContext } from "react";

export type CampusSelectionContextValue = {
  selectedCampusId: string | null;
  setSelectedCampusId: (campusId: string) => void;
};

const CampusSelectionContext = createContext<CampusSelectionContextValue | undefined>(undefined);

export function CampusSelectionProvider({
  value,
  children,
}: {
  value: CampusSelectionContextValue;
  children: ReactNode;
}) {
  return (
    <CampusSelectionContext.Provider value={value}>
      {children}
    </CampusSelectionContext.Provider>
  );
}

export function useCampusSelectionOptional() {
  return useContext(CampusSelectionContext);
}

export function useCampusSelection() {
  const ctx = useCampusSelectionOptional();
  if (!ctx) {
    throw new Error("useCampusSelection must be used within CampusSelectionProvider");
  }
  return ctx;
}
