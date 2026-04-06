"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Loader2, 
  Image as ImageIcon, 
  Check, 
  X, 
  ToggleRight, 
  ToggleLeft,
  Layers,
  Package,
  Upload,
  ChevronRight,
  Utensils,
  TicketPercent,
  Sparkles,
  CalendarDays,
  Percent
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

type Tab = "PRODUCTS" | "CATEGORIES" | "EXTRAS" | "DEALS";

const UnifiedMenuPage = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("PRODUCTS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Data
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [extraGroups, setExtraGroups] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);

  // Modals & Forms
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);

  // Forms State
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: 0,
    categoryId: "",
    imageUrl: "",
    isActive: true,
    extraGroupIds: [] as string[],
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    imageUrl: "",
    isActive: true,
  });

  const [extraForm, setExtraForm] = useState({
    name: "",
    description: "",
    type: "CHECKBOX",
    required: false,
    minSelections: 0,
    maxSelections: 99,
    extras: [] as { name: string; priceAddon: number; isDefault: boolean }[],
    categoryIds: [] as string[],
    position: 0,
  });

  const [dealForm, setDealForm] = useState({
    title: "",
    description: "",
    badgeText: "",
    dealType: "PERCENTAGE",
    discountType: "PERCENTAGE",
    discountValue: 10,
    minOrder: 0,
    comboProductIds: [] as string[],
    isActive: true,
    showOnSite: true,
    popupEnabled: true,
    maxUsages: "",
    maxUsesPerCustomer: "",
    validUntil: "",
    isGlobal: false,
    sortOrder: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedRestaurantId } = useRestaurantStore();
  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  const fetchData = useCallback(async () => {
    if (!selectedRestaurantId) return;
    setLoading(true);
    try {
      const [catRes, prodRes, extraRes, dealRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/categories?restaurantId=${selectedRestaurantId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/api/admin/products?restaurantId=${selectedRestaurantId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/api/admin/extra-groups?restaurantId=${selectedRestaurantId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/api/admin/deals?restaurantId=${selectedRestaurantId}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);
      setCategories(catRes.data);
      setProducts(prodRes.data);
      setExtraGroups(extraRes.data);
      setDeals(dealRes.data);
    } catch (error) {
      console.error("Error fetching menu data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, selectedRestaurantId]);

  // =====================
  // PRODUCT LOGIC
  // =====================
  const openProductModal = (product?: any) => {
    if (product) {
      setEditingId(product.id);
      setProductForm({
        name: product.name,
        description: product.description || "",
        price: product.price,
        categoryId: product.categoryId,
        imageUrl: product.imageUrl || "",
        isActive: product.isActive,
        extraGroupIds: product.extraGroups?.map((eg: any) => eg.id) || [],
      });
    } else {
      setEditingId(null);
      setProductForm({
        name: "",
        description: "",
        price: 0,
        categoryId: categories[0]?.id || "",
        imageUrl: "",
        isActive: true,
        extraGroupIds: [],
      });
    }
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`${API_URL}/api/admin/products/${editingId}`, productForm, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      } else {
        await axios.post(`${API_URL}/api/admin/products`, { ...productForm, restaurantId: selectedRestaurantId }, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      }
      setIsProductModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kunde inte spara produkten");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Radera produkten permanent?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/products/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchData();
    } catch {
      alert("Kunde inte radera produkten");
    }
  };

  // =====================
  // CATEGORY LOGIC
  // =====================
  const openCategoryModal = (category?: any) => {
    if (category) {
      setEditingId(category.id);
      setCategoryForm({
        name: category.name,
        description: category.description || "",
        imageUrl: category.imageUrl || "",
        isActive: category.isActive,
      });
    } else {
      setEditingId(null);
      setCategoryForm({
        name: "",
        description: "",
        imageUrl: "",
        isActive: true,
      });
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`${API_URL}/api/admin/categories/${editingId}`, categoryForm, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      } else {
        await axios.post(`${API_URL}/api/admin/categories`, { ...categoryForm, restaurantId: selectedRestaurantId }, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      }
      setIsCategoryModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kunde inte spara kategorin");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    if (cat._count?.products > 0) return alert("Kategorin måste vara tom.");
    if (!confirm("Radera kategorin?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/categories/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchData();
    } catch {
      alert("Fel vid radering");
    }
  };

  // =====================
  // EXTRAS LOGIC
  // =====================
  const openExtraModal = (group?: any) => {
    if (group) {
      setEditingId(group.id);
      setExtraForm({
        name: group.name,
        description: group.description || "",
        type: group.type,
        required: group.required,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        extras: group.extras.map((e: any) => ({ name: e.name, priceAddon: e.priceAddon, isDefault: e.isDefault })),
        categoryIds: [],
        position: group.position || 0,
      });
    } else {
      setEditingId(null);
      setExtraForm({
        name: "",
        description: "",
        type: "CHECKBOX",
        required: false,
        minSelections: 0,
        maxSelections: 99,
        extras: [],
        categoryIds: [],
        position: 0,
      });
    }
    setIsExtraModalOpen(true);
  };

  const handleSaveExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // categoryIds are used for bulk linking in the UI; don't send it as a Prisma field.
      const { categoryIds, ...payload } = extraForm as any;
      if (editingId) {
        await axios.patch(`${API_URL}/api/admin/extra-groups/${editingId}`, { ...payload, categoryIds }, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      } else {
        await axios.post(`${API_URL}/api/admin/extra-groups`, { ...payload, categoryIds, restaurantId: selectedRestaurantId }, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      }
      setIsExtraModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Fel vid spara tillbehör");
    } finally {
      setSaving(false);
    }
  };

  const deleteExtraGroup = async (id: string) => {
    if (!confirm("Radera tillbehörsgruppen?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/extra-groups/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchData();
    } catch {
      alert("Kunde inte radera");
    }
  };

  // =====================
  // DEALS LOGIC
  // =====================
  const openDealModal = (deal?: any) => {
    if (deal) {
      setEditingId(deal.id);
      setDealForm({
        title: deal.title || "",
        description: deal.description || "",
        badgeText: deal.badgeText || "",
        dealType: deal.dealType || "PERCENTAGE",
        discountType: deal.discountType || "PERCENTAGE",
        discountValue: deal.discountValue || 10,
        minOrder: deal.minOrder || 0,
        comboProductIds: deal.comboProductIds || [],
        isActive: deal.isActive ?? true,
        showOnSite: deal.showOnSite ?? true,
        popupEnabled: deal.popupEnabled ?? true,
        maxUsages: deal.maxUsages?.toString() || "",
        maxUsesPerCustomer: deal.maxUsesPerCustomer?.toString() || "",
        validUntil: deal.validUntil ? new Date(deal.validUntil).toISOString().slice(0, 16) : "",
        isGlobal: deal.isGlobal ?? false,
        sortOrder: deal.sortOrder || 0,
      });
    } else {
      setEditingId(null);
      setDealForm({
        title: "",
        description: "",
        badgeText: "",
        dealType: "PERCENTAGE",
        discountType: "PERCENTAGE",
        discountValue: 10,
        minOrder: 0,
        comboProductIds: [],
        isActive: true,
        showOnSite: true,
        popupEnabled: true,
        maxUsages: "",
        maxUsesPerCustomer: "",
        validUntil: "",
        isGlobal: false,
        sortOrder: deals.length,
      });
    }
    setIsDealModalOpen(true);
  };

  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      title: dealForm.title,
      description: dealForm.description || null,
      badgeText: dealForm.badgeText || null,
      triggerType: dealForm.dealType === "COMBO" ? "COMBO" : dealForm.dealType === "MIN_ORDER" ? "MIN_ORDER" : "NONE",
      discountType: dealForm.discountType,
      discountValue: dealForm.discountValue,
      minOrder: dealForm.minOrder,
      comboProductIds: dealForm.comboProductIds,
      isActive: dealForm.isActive,
      showOnSite: dealForm.showOnSite,
      popupEnabled: dealForm.popupEnabled,
      maxUsages: dealForm.maxUsages ? Number(dealForm.maxUsages) : null,
      maxUsesPerCustomer: dealForm.maxUsesPerCustomer ? Number(dealForm.maxUsesPerCustomer) : null,
      validUntil: dealForm.validUntil ? new Date(dealForm.validUntil).toISOString() : null,
      sortOrder: dealForm.sortOrder,
      isGlobal: dealForm.isGlobal,
      restaurantId: dealForm.isGlobal ? null : selectedRestaurantId,
    };

    try {
      if (editingId) {
        await axios.patch(`${API_URL}/api/admin/deals/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      } else {
        await axios.post(`${API_URL}/api/admin/deals`, payload, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      }
      setIsDealModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kunde inte spara dealen");
    } finally {
      setSaving(false);
    }
  };

  const deleteDeal = async (id: string) => {
    if (!confirm("Radera dealen permanent?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/deals/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchData();
    } catch {
      alert("Kunde inte radera dealen");
    }
  };

  const toggleDealActive = async (deal: any) => {
    try {
      await axios.patch(`${API_URL}/api/admin/deals/${deal.id}`, {
        isActive: !deal.isActive,
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchData();
    } catch {
      alert("Kunde inte uppdatera dealen");
    }
  };

  // Helper: Image upload base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'PRODUCT' | 'CATEGORY') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'PRODUCT') setProductForm(prev => ({ ...prev, imageUrl: reader.result as string }));
        else setCategoryForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Render Helpers
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredExtras = extraGroups.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredDeals = deals.filter((deal) =>
    [deal.title, deal.description, deal.badgeText, ...(deal.comboProductNames || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const formatDealValue = (deal: any) => deal.discountType === "FIXED"
    ? `${deal.discountValue} kr rabatt`
    : `${deal.discountValue}% rabatt`;

  const handleImportEatsmart = async () => {
    if (!confirm("Importera den senaste Eatsmart-menyn och synka kategorier/produkter?")) return;
    setImporting(true);
    try {
      const res = await axios.post(`${API_URL}/api/admin/menu/import-eatsmart`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      await fetchData();
      alert(`Import klar. ${res.data.summary.createdProducts + res.data.summary.updatedProducts} produkter synkade.`);
    } catch (err: any) {
      alert(err.response?.data?.error || "Kunde inte importera menyn");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-10 pb-24">
      {/* Header & Tabs */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Menyhantering</h1>
            <p className="text-[var(--text-primary)]/40 font-medium tracking-wide">Hantera produkter, kategorier och tillbehör på samma ställe.</p>
          </div>
          
          <div className="flex gap-2 p-1.5 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl w-fit">
            {(["PRODUCTS", "CATEGORIES", "EXTRAS", "DEALS"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearchTerm(""); }}
                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeTab === tab ? "bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20" : "text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]"
                }`}
              >
                {tab === "PRODUCTS" && "Artiklar"}
                {tab === "CATEGORIES" && "Kategorier"}
                {tab === "EXTRAS" && "Tillbehör"}
                {tab === "DEALS" && "Deals"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => router.push("/menu/import")}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all shadow-lg shadow-black/20"
          >
            <Upload size={16} />
            Bulk-import
          </button>
          <button
            onClick={handleImportEatsmart}
            disabled={importing || loading}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all disabled:opacity-50"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
            Synka Eatsmart
          </button>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/20 group-focus-within:text-gold-500 transition-colors" size={18} />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Sök ${activeTab.toLowerCase()}...`}
              className="bg-[var(--border-subtle)] border border-[var(--border-strong)] rounded-2xl py-3 pl-12 pr-6 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all text-sm w-64"
            />
          </div>
          <button 
            onClick={() => {
              if (activeTab === "PRODUCTS") openProductModal();
              if (activeTab === "CATEGORIES") openCategoryModal();
              if (activeTab === "EXTRAS") openExtraModal();
              if (activeTab === "DEALS") openDealModal();
            }}
            className="flex items-center gap-2 px-8 py-3 bg-gold-500 text-dark-500 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20"
          >
            <Plus size={18} /> Lägg till
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-gold-500" size={40} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--border-subtle)] p-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Kategorier</div>
              <div className="text-3xl font-black text-gold-500">{categories.length}</div>
            </div>
            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--border-subtle)] p-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Produkter</div>
              <div className="text-3xl font-black text-gold-500">{products.length}</div>
            </div>
            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--border-subtle)] p-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Tillbehörsgrupper</div>
              <div className="text-3xl font-black text-gold-500">{extraGroups.length}</div>
            </div>
            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--border-subtle)] p-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Aktiva deals</div>
              <div className="text-3xl font-black text-gold-500">{deals.filter((deal) => deal.isActive).length}</div>
            </div>
          </div>

          <AnimatePresence mode="wait">
          {activeTab === "PRODUCTS" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="prod" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map(p => (
                <div key={p.id} className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-3xl p-6 group hover:border-gold-500/30 transition-all relative overflow-hidden flex flex-col h-full">
                  <div className="flex gap-4 mb-6">
                    <div className="w-20 h-20 bg-[var(--border-subtle)] rounded-2xl overflow-hidden flex-shrink-0 border border-[var(--border-subtle)]">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><ImageIcon /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                         <h3 className="font-bold text-lg uppercase truncate pr-2">{p.name}</h3>
                         <span className="font-black text-gold-500 whitespace-nowrap">{p.price} KR</span>
                      </div>
                      <p className="text-xs text-[var(--text-primary)]/40 mt-1 line-clamp-2">{p.description || "Ingen beskrivning"}</p>
                      <div className="mt-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 bg-[var(--border-subtle)] w-fit px-2 py-1 rounded">{p.category?.name}</div>
                    </div>
                  </div>
                  <div className="mt-auto pt-6 border-t border-dashed border-[var(--border-strong)] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {p.isActive ? <span className="text-emerald-400 text-[10px] font-black uppercase flex items-center gap-1"><Check size={12} /> Aktiv</span> : <span className="text-red-400 text-[10px] font-black uppercase flex items-center gap-1"><X size={12} /> Dold</span>}
                      <span className="text-[var(--text-primary)]/20 text-[9px] font-bold uppercase">{p.extraGroups?.length || 0} Tillbehör</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={() => openProductModal(p)} className="p-3 bg-[var(--border-subtle)] hover:bg-white/10 rounded-xl transition-all"><Edit2 size={16} /></button>
                       <button onClick={() => deleteProduct(p.id)} className="p-3 bg-red-400/5 hover:bg-red-400/20 text-red-400 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "CATEGORIES" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="cat" className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredCategories.map(cat => (
                <div key={cat.id} className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[2rem] overflow-hidden group hover:border-gold-500/30 transition-all flex flex-col h-full">
                  <div className="h-32 bg-dark-400 relative overflow-hidden">
                    {cat.imageUrl ? <img src={cat.imageUrl} className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center opacity-5"><ImageIcon size={40} /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-500 via-dark-500/20 to-transparent" />
                    <div className="absolute bottom-4 left-6">
                       <h3 className="font-black text-xl uppercase tracking-widest">{cat.name}</h3>
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <p className="text-xs text-[var(--text-primary)]/40 line-clamp-2 mb-6 flex-1">{cat.description || "Ingen beskrivning..."}</p>
                    <div className="flex items-center justify-between pt-6 border-t border-[var(--border-subtle)]">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/20">{cat._count?.products || 0} Art</span>
                      <div className="flex items-center gap-2">
                         <button onClick={() => openCategoryModal(cat)} className="p-3 bg-[var(--border-subtle)] hover:bg-white/10 rounded-xl transition-all"><Edit2 size={16} /></button>
                         <button onClick={() => deleteCategory(cat.id)} className="p-3 bg-red-400/5 hover:bg-red-400/20 text-red-400 rounded-xl transition-all"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "EXTRAS" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="extra" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredExtras.map(group => (
                <div key={group.id} className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-3xl p-8 group hover:border-gold-500/30 transition-all flex flex-col h-full">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-bold uppercase tracking-wider mb-2">{group.name}</h3>
                      <div className="flex gap-2">
                        <span className="text-[9px] font-black uppercase bg-gold-500/10 text-gold-500 px-2 py-0.5 rounded ring-1 ring-gold-500/20">{group.type}</span>
                        {group.required && <span className="text-[9px] font-black uppercase bg-red-500/10 text-red-400 px-2 py-0.5 rounded ring-1 ring-red-500/20">Obligatorisk</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={() => openExtraModal(group)} className="p-2 bg-[var(--border-subtle)] hover:bg-white/10 rounded-xl transition-all"><Edit2 size={16} /></button>
                       <button onClick={() => deleteExtraGroup(group.id)} className="p-2 bg-red-400/5 hover:bg-red-400/20 text-red-400 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1">
                    {group.extras.map((e: any) => (
                      <div key={e.id} className="flex justify-between items-center text-xs p-3 bg-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)]">
                        <span className="font-medium">{e.name}</span>
                        <span className="font-black text-gold-500">+{e.priceAddon} kr</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "DEALS" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="deals" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredDeals.map((deal) => (
                <div key={deal.id} className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[2rem] p-8 hover:border-gold-500/30 transition-all flex flex-col h-full">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500 bg-gold-500/10 px-3 py-1 rounded-full">
                          {deal.dealType === "COMBO" ? "Combo" : deal.dealType === "MIN_ORDER" ? "Minimiorder" : "Procentdeal"}
                        </span>
                        {deal.badgeText && (
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/50 bg-[var(--border-subtle)] px-3 py-1 rounded-full">
                            {deal.badgeText}
                          </span>
                        )}
                      </div>
                      <h3 className="text-2xl font-black tracking-tight">{deal.title}</h3>
                      <p className="text-[var(--text-primary)]/40 text-sm mt-2 leading-relaxed">{deal.description || "Ingen beskrivning ännu."}</p>
                    </div>
                    <button
                      onClick={() => toggleDealActive(deal)}
                      className={`p-3 rounded-2xl border transition-all ${deal.isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-[var(--border-subtle)] border-[var(--border-strong)] text-[var(--text-primary)]/40"}`}
                    >
                      {deal.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] p-4">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Belöning</div>
                      <div className="text-lg font-black text-gold-500">{formatDealValue(deal)}</div>
                    </div>
                    <div className="rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] p-4">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Gäller till</div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{deal.validUntil ? new Date(deal.validUntil).toLocaleDateString("sv-SE") : "Tills vidare"}</div>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-[var(--text-primary)]/55 flex-1">
                    {deal.minOrder > 0 && (
                      <div className="flex items-center gap-3 rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] px-4 py-3">
                        <Percent size={16} className="text-gold-500" />
                        Från {deal.minOrder} kr
                      </div>
                    )}
                    {deal.comboProductNames?.length > 0 && (
                      <div className="rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20 mb-2">Combo</div>
                        <div className="flex flex-wrap gap-2">
                          {deal.comboProductNames.map((name: string) => (
                            <span key={name} className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/60 bg-dark-500 px-3 py-1 rounded-full">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] px-4 py-3 flex items-center justify-between">
                      <span>Visas på sidan</span>
                      <span className={deal.showOnSite ? "text-emerald-300 font-bold" : "text-[var(--text-primary)]/30 font-bold"}>
                        {deal.showOnSite ? "Ja" : "Nej"}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[var(--border-subtle)] border border-[var(--border-subtle)] px-4 py-3 flex items-center justify-between">
                      <span>Per kund</span>
                      <span className="font-bold text-[var(--text-primary)]">{deal.maxUsesPerCustomer || "Obegränsat"}</span>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-primary)]/20">
                      {deal.usageCount} / {deal.maxUsages || "∞"} användningar
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openDealModal(deal)} className="p-3 bg-[var(--border-subtle)] hover:bg-white/10 rounded-xl transition-all">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteDeal(deal.id)} className="p-3 bg-red-400/5 hover:bg-red-400/20 text-red-400 rounded-xl transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
          </AnimatePresence>
        </>
      )}

      {/* MODALS */}
      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-500/90 backdrop-blur-md">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-dark-400 border border-[var(--border-strong)] rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-black">
             <div className="p-10 border-b border-[var(--border-subtle)] flex justify-between items-center bg-dark-400 z-10 sticky top-0">
               <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">{editingId ? 'Redigera Artikel' : 'Ny Artikel'}</h2>
                  <p className="text-[var(--text-primary)]/40 text-sm mt-1">Ställ in priser, tillbehör och kategorier.</p>
               </div>
               <button onClick={() => setIsProductModalOpen(false)} className="p-4 bg-[var(--border-subtle)] rounded-full hover:bg-white/10 transition-colors"><X size={24} /></button>
             </div>
             
             <div className="p-10 overflow-y-auto no-scrollbar flex-1">
                <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Artikelnamn</label>
                      <input required value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" placeholder="t.ex. Margherita" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Pris (KR)</label>
                        <input required type="number" value={productForm.price || ""} onChange={e => setProductForm({...productForm, price: parseInt(e.target.value) || 0})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" placeholder="100" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Kategori</label>
                        <select value={productForm.categoryId} onChange={e => setProductForm({...productForm, categoryId: e.target.value})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none">
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Beskrivning</label>
                      <textarea value={productForm.description} onChange={e => setProductForm({...productForm, description: e.target.value})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50 h-32 resize-none" placeholder="Ingredienser..." />
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Bild</label>
                      <div className="flex gap-4">
                        <div className="w-24 h-24 bg-[var(--border-subtle)] rounded-2xl flex items-center justify-center border border-dashed border-[var(--border-strong)] overflow-hidden">
                           {productForm.imageUrl ? <img src={productForm.imageUrl} className="w-full h-full object-cover" /> : <Utensils className="opacity-10" />}
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                           <input type="text" value={productForm.imageUrl} onChange={e => setProductForm({...productForm, imageUrl: e.target.value})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl py-3 px-4 text-xs" placeholder="URL till bild..." />
                           <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 justify-center w-full py-3 bg-[var(--border-subtle)] hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[var(--border-subtle)]">
                             <Upload size={14} /> Ladda Upp
                           </button>
                           <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleImageUpload(e, 'PRODUCT')} />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[var(--border-subtle)]">
                       <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-4 ml-1">Koppla Tillbehör</label>
                       <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                          {extraGroups.map(g => {
                            const isSelected = productForm.extraGroupIds.includes(g.id);
                            return (
                              <button
                                type="button"
                                key={g.id}
                                onClick={() => {
                                  const ids = isSelected ? productForm.extraGroupIds.filter(id => id !== g.id) : [...productForm.extraGroupIds, g.id];
                                  setProductForm({...productForm, extraGroupIds: ids});
                                }}
                                className={`p-4 rounded-2xl border text-sm font-bold transition-all text-left flex justify-between items-center ${isSelected ? "bg-gold-500/10 border-gold-500 text-gold-500" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] text-[var(--text-primary)]/40 hover:bg-white/10"}`}
                              >
                                {g.name}
                                {isSelected && <Check size={14} />}
                              </button>
                            );
                          })}
                       </div>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2 pt-10 border-t border-[var(--border-subtle)]">
                    <button type="submit" disabled={saving} className="w-full py-5 bg-gold-500 hover:bg-gold-400 text-dark-500 font-extrabold rounded-2xl transition-all shadow-xl shadow-gold-500/20 uppercase tracking-[0.2em] flex items-center justify-center gap-3">
                      {saving ? <Loader2 size={24} className="animate-spin" /> : <Check size={24} />} Spara Artikel
                    </button>
                  </div>
                </form>
             </div>
          </motion.div>
        </div>
      )}

      {/* Category Modal - simplified */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-500/90 backdrop-blur-md">
           <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-dark-400 border border-[var(--border-strong)] rounded-[2.5rem] w-full max-w-lg shadow-2xl">
              <div className="p-10 border-b border-[var(--border-subtle)] flex justify-between items-center">
                 <h2 className="text-2xl font-black uppercase tracking-tight">{editingId ? 'Redigera Kategori' : 'Ny Kategori'}</h2>
                 <button onClick={() => setIsCategoryModalOpen(false)} className="p-3 bg-[var(--border-subtle)] rounded-full"><X size={20} /></button>
              </div>
              <form onSubmit={handleSaveCategory} className="p-10 space-y-6">
                 <div>
                   <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-2">Namn</label>
                   <input required value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" placeholder="t.ex. Kebabrullar" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 mb-2">Bild URL</label>
                   <input value={categoryForm.imageUrl} onChange={e => setCategoryForm({...categoryForm, imageUrl: e.target.value})} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" placeholder="https://..." />
                 </div>
                 <button disabled={saving} className="w-full py-5 bg-gold-500 text-dark-500 font-extrabold rounded-2xl uppercase tracking-widest mt-4">Spara</button>
              </form>
           </motion.div>
        </div>
      )}

      {/* Extra Modal - Simplified table-like */}
      {isExtraModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-500/90 backdrop-blur-md">
           <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-dark-400 border border-[var(--border-strong)] rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
              <div className="p-10 border-b border-[var(--border-subtle)] flex justify-between items-center">
                 <h2 className="text-2xl font-black uppercase tracking-tight">{editingId ? 'Redigera Grupp' : 'Ny Grupp'}</h2>
                 <button onClick={() => setIsExtraModalOpen(false)} className="p-3 bg-[var(--border-subtle)] rounded-full"><X size={20} /></button>
              </div>
              <div className="p-10 overflow-y-auto flex-1 no-scrollbar space-y-8">
                <form id="extraForm" onSubmit={handleSaveExtra} className="space-y-8">
                   <div className="grid grid-cols-2 gap-6">
                      <input required value={extraForm.name} onChange={e => setExtraForm({...extraForm, name: e.target.value})} className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl p-4 outline-none" placeholder="Gruppnamn..." />
                      <select value={extraForm.type} onChange={e => setExtraForm({...extraForm, type: e.target.value})} className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl p-4 outline-none">
                         <option value="CHECKBOX">Flerval</option>
                         <option value="RADIO">Endast ett val</option>
                      </select>
                      <div className="flex bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 items-center justify-between">
                         <span className="text-[10px] font-black uppercase text-[var(--text-primary)]/40 tracking-widest">Prio (1=först)</span>
                         <input 
                           type="number" 
                           value={extraForm.position} 
                           onChange={e => setExtraForm({...extraForm, position: parseInt(e.target.value) || 0})} 
                           className="bg-dark-500 w-16 text-center border border-[var(--border-strong)] rounded-xl py-1 font-bold outline-none" 
                         />
                      </div>
                      <button
                        type="button"
                        onClick={() => setExtraForm({ ...extraForm, required: !extraForm.required })}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between font-bold ${
                          extraForm.required ? "bg-red-500/10 border-red-500 text-red-400" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] text-[var(--text-primary)]/40 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-xs">Obligatoriskt val?</span>
                        {extraForm.required ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                   </div>

                   <div className="space-y-4">
                      <label className="block text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest ml-1">Assigna till hel kategori (Bulk-koppling)</label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 no-scrollbar">
                         {categories.map(cat => {
                           const isSelected = extraForm.categoryIds.includes(cat.id);
                           return (
                             <button
                               type="button"
                               key={cat.id}
                               onClick={() => {
                                 const ids = isSelected 
                                   ? extraForm.categoryIds.filter(id => id !== cat.id) 
                                   : [...extraForm.categoryIds, cat.id];
                                 setExtraForm({...extraForm, categoryIds: ids});
                               }}
                               className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex justify-between items-center ${
                                 isSelected ? "bg-gold-500/10 border-gold-500 text-gold-500 shadow-lg shadow-gold-500/10" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] text-[var(--text-primary)]/20 hover:bg-white/10"
                               }`}
                             >
                               <span className="truncate">{cat.name}</span>
                               {isSelected && <Check size={14} />}
                             </button>
                           );
                         })}
                      </div>
                      <p className="text-[9px] text-[var(--text-primary)]/20 italic">Markera kategorier för att koppla denna grupp till alla deras produkter vid spara.</p>
                   </div>
                   <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-[var(--text-primary)]/20 tracking-widest">Tillbehörsrader</label>
                        <button type="button" onClick={() => setExtraForm({...extraForm, extras: [...extraForm.extras, {name: "", priceAddon: 0, isDefault: false}]})} className="text-[10px] font-black bg-gold-500 text-dark-500 px-3 py-1 rounded uppercase tracking-widest">+ Rad</button>
                      </div>
                      {extraForm.extras.map((ex, idx) => (
                        <div key={idx} className="flex gap-4">
                           <input value={ex.name} onChange={e => {
                             const n = [...extraForm.extras]; n[idx].name = e.target.value; setExtraForm({...extraForm, extras: n});
                           }} className="flex-1 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl p-3 text-sm" placeholder="Namn" />
                           <input
                             type="number"
                             min={0}
                             step="1"
                             value={ex.priceAddon ?? ""}
                             onChange={(e) => {
                               const raw = e.target.value;
                               const n = [...extraForm.extras];
                               n[idx].priceAddon = raw === "" ? 0 : Number(raw);
                               setExtraForm({ ...extraForm, extras: n });
                             }}
                             className="w-24 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl p-3 text-sm text-center"
                             placeholder="Pris"
                           />
                           <button type="button" onClick={() => {
                             setExtraForm({...extraForm, extras: extraForm.extras.filter((_, i) => i !== idx)});
                           }} className="p-3 text-red-400 bg-red-400/10 rounded-xl hover:bg-red-400/20"><Trash2 size={16} /></button>
                        </div>
                      ))}
                   </div>
                </form>
              </div>
              <div className="p-8 bg-dark-400 border-t border-[var(--border-subtle)]">
                 <button form="extraForm" className="w-full py-5 bg-gold-500 text-dark-500 font-extrabold rounded-2xl uppercase tracking-widest">Spara Grupp</button>
              </div>
           </motion.div>
        </div>
      )}

      {isDealModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-dark-500/90 backdrop-blur-md">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-dark-400 border border-[var(--border-strong)] rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-black">
            <div className="p-10 border-b border-[var(--border-subtle)] flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight">{editingId ? "Redigera Deal" : "Ny Deal"}</h2>
                <p className="text-[var(--text-primary)]/40 text-sm mt-1">Bygg riktiga deals som syns på sidan och kan appliceras automatiskt.</p>
              </div>
              <button onClick={() => setIsDealModalOpen(false)} className="p-4 bg-[var(--border-subtle)] rounded-full hover:bg-white/10 transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-10 overflow-y-auto no-scrollbar flex-1">
              <form onSubmit={handleSaveDeal} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Titel</label>
                    <input required value={dealForm.title} onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" placeholder="T.ex. 10% på hela ordern" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Badge</label>
                    <input value={dealForm.badgeText} onChange={(e) => setDealForm({ ...dealForm, badgeText: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50" placeholder="T.ex. Helgens deal" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Beskrivning</label>
                  <textarea value={dealForm.description} onChange={(e) => setDealForm({ ...dealForm, description: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/50 h-28 resize-none" placeholder="Kort text som kunden ser i menyn och carten." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Dealtyp</label>
                    <select value={dealForm.dealType} onChange={(e) => setDealForm({ ...dealForm, dealType: e.target.value, comboProductIds: e.target.value === "COMBO" ? dealForm.comboProductIds : [] })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none">
                      <option value="PERCENTAGE">Procentdeal</option>
                      <option value="MIN_ORDER">Minimiorder</option>
                      <option value="COMBO">Combo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Belöning</label>
                    <select value={dealForm.discountType} onChange={(e) => setDealForm({ ...dealForm, discountType: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none">
                      <option value="PERCENTAGE">%</option>
                      <option value="FIXED">Fast kr</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">{dealForm.discountType === "FIXED" ? "Rabatt (KR)" : "Rabatt (%)"}</label>
                    <input type="number" min={1} value={dealForm.discountValue || ""} onChange={(e) => setDealForm({ ...dealForm, discountValue: parseInt(e.target.value) || 0 })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Minimiorder</label>
                    <input type="number" min={0} value={dealForm.minOrder || ""} onChange={(e) => setDealForm({ ...dealForm, minOrder: parseInt(e.target.value) || 0 })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" />
                  </div>
                </div>

                {dealForm.dealType === "COMBO" && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Combo-produkter</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2 no-scrollbar">
                      {products.map((product) => {
                        const isSelected = dealForm.comboProductIds.includes(product.id);
                        return (
                          <button
                            type="button"
                            key={product.id}
                            onClick={() => {
                              const comboProductIds = isSelected
                                ? dealForm.comboProductIds.filter((id) => id !== product.id)
                                : [...dealForm.comboProductIds, product.id];
                              setDealForm({ ...dealForm, comboProductIds });
                            }}
                            className={`p-4 rounded-2xl border text-sm font-bold transition-all text-left flex justify-between items-center ${isSelected ? "bg-gold-500/10 border-gold-500 text-gold-500" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] text-[var(--text-primary)]/40 hover:bg-white/10"}`}
                          >
                            <span className="truncate pr-4">{product.name}</span>
                            {isSelected && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Giltig till</label>
                    <input type="datetime-local" value={dealForm.validUntil} onChange={(e) => setDealForm({ ...dealForm, validUntil: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Sortering</label>
                    <input type="number" min={0} value={dealForm.sortOrder || 0} onChange={(e) => setDealForm({ ...dealForm, sortOrder: parseInt(e.target.value) || 0 })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Max användningar totalt</label>
                    <input type="number" min={1} value={dealForm.maxUsages} onChange={(e) => setDealForm({ ...dealForm, maxUsages: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" placeholder="Tomt = obegränsat" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 mb-3 ml-1">Per kund</label>
                    <input type="number" min={1} value={dealForm.maxUsesPerCustomer} onChange={(e) => setDealForm({ ...dealForm, maxUsesPerCustomer: e.target.value })} className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-6 outline-none" placeholder="Tomt = obegränsat" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { key: "isActive", label: "Aktiv nu" },
                    { key: "showOnSite", label: "Visa på sidan" },
                    { key: "popupEnabled", label: "Visa popup" },
                    { key: "isGlobal", label: "Global Deal" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setDealForm((prev) => ({ ...prev, [option.key]: !prev[option.key as keyof typeof prev] }))}
                      className={`p-4 rounded-2xl border text-left transition-all ${(dealForm as any)[option.key] ? "bg-gold-500/10 border-gold-500 text-gold-500" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] text-[var(--text-primary)]/50"}`}
                    >
                      <div className="text-[10px] font-black uppercase tracking-[0.3em] mb-2">{option.label}</div>
                      <div className="font-bold">{(dealForm as any)[option.key] ? "På" : "Av"}</div>
                    </button>
                  ))}
                </div>

                <button type="submit" disabled={saving} className="w-full py-5 bg-gold-500 hover:bg-gold-400 text-dark-500 font-extrabold rounded-2xl transition-all shadow-xl shadow-gold-500/20 uppercase tracking-[0.2em] flex items-center justify-center gap-3">
                  {saving ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={22} />} Spara Deal
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default UnifiedMenuPage;
