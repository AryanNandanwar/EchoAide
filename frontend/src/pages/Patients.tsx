import { useEffect, useState, useMemo } from "react";
import api from "../lib/api";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Avatar,
  TextField,
  InputAdornment,
  MenuItem,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ResponsiveAppBar from "../components/navbar";

type Patient = {
  id: string;
  fullName: string;
  gender?: string;
  age?: number;
  phone?: string;
  createdAt: string; // Added to support sorting by date
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Sort State
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest">("latest");

  useEffect(() => {
    api.get("/api/doctor/me/patients")
      .then((res) => {
        setPatients(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  // Filter and Sort Logic
  const filteredPatients = useMemo(() => {
    return patients
      .filter((p) => {
        const searchLower = search.toLowerCase();
        // Search by Name or Phone
        return (
          search === "" ||
          p.fullName.toLowerCase().includes(searchLower) ||
          (p.phone && p.phone.includes(searchLower))
        );
      })
      .sort((a, b) => {
        // Sort by Created Date
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "latest" ? dateB - dateA : dateA - dateB;
      });
  }, [patients, search, sortOrder]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[70vh]">
        <CircularProgress />
      </div>
    );
  }

  return (
    <>
      {/* Navbar */}
      <ResponsiveAppBar />

      {/* Page Content (offset because navbar is fixed) */}
      <div className="pt-20 min-h-screen bg-slate-50 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
             <Typography variant="h5" className="font-semibold text-slate-800">
               My Patients
             </Typography>

             <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
               {/* Search Input */}
               <TextField
                 placeholder="Search name or phone..."
                 size="small"
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="bg-white"
                 sx={{ minWidth: 220 }}
                 InputProps={{
                   startAdornment: (
                     <InputAdornment position="start">
                       <SearchIcon className="text-slate-400" />
                     </InputAdornment>
                   ),
                 }}
               />

               {/* Sort Dropdown */}
               <TextField
                 select
                 size="small"
                 value={sortOrder}
                 onChange={(e) => setSortOrder(e.target.value as "latest" | "oldest")}
                 className="bg-white"
                 sx={{ minWidth: 150 }}
               >
                 <MenuItem value="latest">Latest Added</MenuItem>
                 <MenuItem value="oldest">Oldest Added</MenuItem>
               </TextField>
             </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map((p) => (
              <Card
                key={p.id}
                className="rounded-2xl shadow-sm border hover:shadow-md transition"
              >
                <CardContent>
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="bg-indigo-500">
                      {p.fullName?.charAt(0)}
                    </Avatar>

                    <div>
                      <Typography className="font-medium text-lg">
                        {p.fullName}
                      </Typography>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {p.gender && <Chip label={`Gender: ${p.gender}`} />}
                    {p.age && <Chip label={`Age: ${p.age}`} />}
                    {p.phone && <Chip label={`Contact: ${p.phone}`} />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredPatients.length === 0 && (
            <div className="text-center text-slate-500 mt-20">
              {search ? "No patients match your search" : "No patients found"}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
