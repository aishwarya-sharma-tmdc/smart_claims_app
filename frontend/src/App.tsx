import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Claimants from "./pages/Claimants";
import ClaimantJourney from "./pages/ClaimantJourney";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/claimants" element={<Claimants />} />
        <Route path="/claimants/:id" element={<ClaimantJourney />} />
      </Routes>
    </Layout>
  );
}
