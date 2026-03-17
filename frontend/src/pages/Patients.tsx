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
  IconButton,
  Menu,
  Box,
  Badge,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import NotesIcon from "@mui/icons-material/Notes";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useNavigate } from "react-router-dom";
import ResponsiveAppBar from "../components/navbar";

type Patient = {
  id: string;
  fullName: string;
  gender?: string;
  age?: number;
  phone?: string;
  createdAt: string;
  notesCount?: number;
};

type NoteSummary = {
  id: string;
  createdAt: string;
  summary: string;
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesSummaries, setNotesSummaries] = useState<Record<string, NoteSummary[]>>({});
  const [loadingNotes, setLoadingNotes] = useState<Record<string, boolean>>({});
  const [anchorEl, setAnchorEl] = useState<Record<string, HTMLElement | null>>({});
  const navigate = useNavigate();

  // Search and Sort State
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest">("latest");

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await api.get("/api/doctor/me/patients");
        const patientsData = res.data;
        
        // Fetch notes count for each patient
        const patientsWithCounts = await Promise.all(
          patientsData.map(async (patient: Patient) => {
            try {
              const countRes = await api.get(`/api/clinical-notes/patient/${patient.id}/count`);
              return { ...patient, notesCount: countRes.data.count };
            } catch (error) {
              console.error(`Failed to fetch notes count for patient ${patient.id}:`, error);
              return { ...patient, notesCount: 0 };
            }
          })
        );
        
        setPatients(patientsWithCounts);
      } catch (error) {
        console.error('Failed to fetch patients:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPatients();
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

  const fetchNotesSummary = async (patientId: string) => {
    if (notesSummaries[patientId]) return; // Already fetched
    
    setLoadingNotes(prev => ({ ...prev, [patientId]: true }));
    try {
      const res = await api.get(`/api/clinical-notes/patient/${patientId}/summary`);
      setNotesSummaries(prev => ({ ...prev, [patientId]: res.data }));
    } catch (error) {
      console.error(`Failed to fetch notes summary for patient ${patientId}:`, error);
    } finally {
      setLoadingNotes(prev => ({ ...prev, [patientId]: false }));
    }
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, patientId: string) => {
    setAnchorEl(prev => ({ ...prev, [patientId]: event.currentTarget }));
    fetchNotesSummary(patientId);
  };

  const handleMenuClose = (patientId: string) => {
    setAnchorEl(prev => ({ ...prev, [patientId]: null }));
  };

  const handleNoteClick = (noteId: string) => {
    navigate(`/notes#${noteId}`);
  };

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

                  <div className="flex items-center justify-between mt-4">
                    <Badge 
                      badgeContent={p.notesCount || 0} 
                      color="primary" 
                      showZero
                      className="cursor-pointer"
                      onClick={(e) => handleMenuClick(e, p.id)}
                    >
                      <Chip
                        icon={<NotesIcon />}
                        label="Notes"
                        variant="outlined"
                        size="small"
                        className="hover:bg-slate-100"
                      />
                    </Badge>
                    
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuClick(e, p.id)}
                      className="text-slate-600 hover:bg-slate-100"
                    >
                      <ExpandMoreIcon />
                    </IconButton>
                  </div>

                  <Menu
                    anchorEl={anchorEl[p.id]}
                    open={Boolean(anchorEl[p.id])}
                    onClose={() => handleMenuClose(p.id)}
                    PaperProps={{
                      style: {
                        maxHeight: 300,
                        width: '300px',
                      },
                    }}
                  >
                    <Box className="p-2">
                      <Typography variant="subtitle2" className="font-medium text-slate-700 mb-2">
                        Recent Notes ({p.notesCount || 0})
                      </Typography>
                      
                      {loadingNotes[p.id] ? (
                        <Box className="flex justify-center py-4">
                          <CircularProgress size={20} />
                        </Box>
                      ) : notesSummaries[p.id]?.length > 0 ? (
                        notesSummaries[p.id].map((note) => (
                          <Box
                            key={note.id}
                            onClick={() => handleNoteClick(note.id)}
                            className="p-2 hover:bg-slate-50 rounded cursor-pointer mb-1"
                          >
                            <Typography variant="caption" className="text-slate-500">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </Typography>
                            <Typography variant="body2" className="text-slate-700 text-sm">
                              {note.summary}
                            </Typography>
                          </Box>
                        ))
                      ) : (
                        <Typography variant="body2" className="text-slate-500 text-center py-4">
                          No notes found
                        </Typography>
                      )}
                    </Box>
                  </Menu>
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
