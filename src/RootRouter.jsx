import { useEffect, useState } from "react";
import App from "./App.jsx";
import AdminApp from "./admin/AdminApp.jsx";

export default function RootRouter() {
  const [isAdmin, setIsAdmin] = useState(() =>
    window.location.hash.startsWith("#/admin")
  );

  useEffect(() => {
    function handleHashChange() {
      setIsAdmin(window.location.hash.startsWith("#/admin"));
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return isAdmin ? <AdminApp /> : <App />;
}
