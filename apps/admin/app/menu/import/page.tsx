"use client";

import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle 
} from "lucide-react";
import { API_URL } from "@/lib/api";

export default function BulkImportPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ created: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResults(null);
    setError(null);

    try {
      const token = localStorage.getItem("palmyra_token") || "";
      const res = await axios.post(
        `${API_URL}/api/admin/menu/bulk-import`,
        { text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResults({
        created: res.data.created,
        errors: res.data.errors,
      });
      setText("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Kunde inte genomföra importen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => router.back()} 
          className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/40 hover:text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-1">Menyhantering</div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Bulk-import</h1>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-[2rem] p-8 flex gap-6 items-start">
        <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 flex-shrink-0">
          <HelpCircle size={24} />
        </div>
        <div className="space-y-2">
          <h3 className="font-bold uppercase tracking-wider text-blue-300">Instruktioner</h3>
          <p className="text-sm text-blue-300/60 leading-relaxed">
            Klistra in dina produkter rad för rad i formatet:<br/>
            <code className="bg-dark-500 px-2 py-1 rounded text-white/80 font-mono text-xs">Kategori : Produktnamn : Pris : Beskrivning</code>
          </p>
          <div className="mt-4 p-4 bg-dark-500/50 rounded-xl font-mono text-[10px] text-white/30 border border-white/5 space-y-1">
             <div>Pizzor : Margherita : 95 : Tomat, ost</div>
             <div>Pizzor : Vesuvio : 105 : Tomat, ost, skinka</div>
             <div>Sallader : Kebabsallad : 110 : Kebab, isberg, lök, sås</div>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="relative group">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Klistra in här..."
          className="w-full h-80 bg-white/5 border border-white/10 rounded-[2rem] p-8 outline-none focus:ring-4 focus:ring-gold-500/20 focus:border-gold-500/50 transition-all font-mono text-sm leading-relaxed"
          disabled={loading}
        />
        <div className="absolute top-6 right-8 text-[10px] font-black uppercase tracking-widest text-white/10 group-focus-within:text-gold-500/50 transition-colors">
          TXT Import
        </div>
      </div>

      {/* Action */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={handleImport}
          disabled={loading || !text.trim()}
          className="w-full sm:flex-1 py-5 bg-gold-500 text-dark-500 font-black uppercase tracking-[0.2em] text-sm rounded-2xl hover:bg-gold-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 shadow-xl shadow-gold-500/10"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <Upload size={20} />
              Starta Import
            </>
          )}
        </button>
      </div>

      {/* Feedback */}
      {results && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-emerald-400/60">Skapade</div>
              <div className="text-2xl font-black">{results.created} st</div>
            </div>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex items-center gap-4">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-widest text-red-400/60">Felaktiga rader</div>
              <div className="text-2xl font-black">{results.errors} st</div>
            </div>
          </div>
          {results.created > 0 && (
            <div className="sm:col-span-2 text-center text-xs text-white/30 font-bold uppercase tracking-widest py-4">
              Produkterna har lagts till i menyn. Du kan nu gå tillbaka och lägga till tillbehör.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center text-red-500 font-bold uppercase tracking-widest text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
