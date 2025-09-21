import React, { useState, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- DATA TYPES ---
interface Profile {
    userName: string;
    jabatan: string;
    tanggalAnalisa: string;
    companyName: string;
    sector: string;
    unitName: string;
}

type ImpactLevel = 'Rendah' | 'Sedang' | 'Tinggi';
type PriorityScale = 1 | 2 | 3 | 4 | 5;

interface AnalysisFactor {
    id: number;
    text: string;
    impact: ImpactLevel;
    priority: PriorityScale;
    isExternal?: boolean;
}

interface SwotData {
    strengths: AnalysisFactor[];
    weaknesses: AnalysisFactor[];
    opportunities: AnalysisFactor[];
    threats: AnalysisFactor[];
}

interface PestleData {
    political: AnalysisFactor[];
    economic: AnalysisFactor[];
    social: AnalysisFactor[];
    technological: AnalysisFactor[];
    legal: AnalysisFactor[];
    environmental: AnalysisFactor[];
}

type SwotCategory = keyof SwotData;
type PestleCategory = keyof PestleData;
type AnalysisCategory = SwotCategory | PestleCategory;


interface TowsStrategy {
    id: number;
    category: 'SO' | 'ST' | 'WO' | 'WT';
    text: string;
    impact: ImpactLevel;
    priority: PriorityScale;
}

const IMPACT_LEVELS: ImpactLevel[] = ['Rendah', 'Sedang', 'Tinggi'];
const PRIORITY_SCALES: PriorityScale[] = [1, 2, 3, 4, 5];

// --- API INITIALIZATION ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const App: React.FC = () => {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({});

    const [profile, setProfile] = useState<Profile>({
        userName: '',
        jabatan: '',
        tanggalAnalisa: new Date().toISOString().split('T')[0],
        companyName: '',
        sector: 'manufaktur',
        unitName: ''
    });
    
    const [customSector, setCustomSector] = useState('');

    const [swot, setSwot] = useState<SwotData>({
        strengths: [], weaknesses: [], opportunities: [], threats: []
    });

    const [pestle, setPestle] = useState<PestleData>({
        political: [], economic: [], social: [], technological: [], legal: [], environmental: []
    });
    
    const [tows, setTows] = useState<TowsStrategy[]>([]);
    
    const [manualInputs, setManualInputs] = useState<Record<AnalysisCategory, string>>({
        strengths: '', weaknesses: '', opportunities: '', threats: '',
        political: '', economic: '', social: '', technological: '', legal: '', environmental: ''
    });
    
    const idCounter = useRef(100);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setProfile({ ...profile, [e.target.name]: e.target.value });
    };

    const isSwotCategory = (category: AnalysisCategory): category is SwotCategory => category in swot;

    const updateFactor = (category: AnalysisCategory, id: number, field: 'impact' | 'priority' | 'text', value: any) => {
        const updater = (prevState: any) => ({
            ...prevState,
            [category]: prevState[category].map((item: AnalysisFactor) => 
                item.id === id ? { ...item, [field]: value } : item
            )
        });
        if (isSwotCategory(category)) setSwot(updater);
        else setPestle(updater);
    };
    
    const addFactor = (category: AnalysisCategory) => {
        const text = manualInputs[category]?.trim();
        if (!text) return;
        
        const newFactor: AnalysisFactor = {
            id: idCounter.current++,
            text,
            impact: 'Sedang',
            priority: 3,
            isExternal: ['opportunities', 'threats', 'political', 'economic', 'social', 'technological', 'legal', 'environmental'].includes(category),
        };

        const updater = (prevState: any) => ({
            ...prevState,
            [category]: [...prevState[category], newFactor]
        });

        if (isSwotCategory(category)) setSwot(updater);
        else setPestle(updater);

        setManualInputs(prev => ({ ...prev, [category]: '' }));
    };

    const deleteFactor = (category: AnalysisCategory, id: number) => {
        const updater = (prevState: any) => ({
            ...prevState,
            [category]: prevState[category].filter((item: AnalysisFactor) => item.id !== id)
        });
        if (isSwotCategory(category)) setSwot(updater);
        else setPestle(updater);
    };
    
    const updateTowsStrategy = (id: number, field: 'impact' | 'priority', value: any) => {
        setTows(prevTows => prevTows.map(strategy => 
            strategy.id === id ? { ...strategy, [field]: value } : strategy
        ));
    };

    const generateInitialAnalysis = async () => {
        setIsLoading(true);
        setLoadingMessage('Melakukan riset internet dan menyusun draf analisis SWOT & PESTLE...');
        setError(null);
        try {
            const sectorForAnalysis = profile.sector === 'lainnya' ? customSector : profile.sector;
            const prompt = `Anda adalah analis ISO 9001:2015. Berdasarkan profil perusahaan ini: Nama: ${profile.companyName}, Sektor: ${sectorForAnalysis}, Unit: ${profile.unitName}, lakukan riset internet dan hasilkan draf analisis SWOT dan PESTLE (termasuk faktor Lingkungan/Environmental). Berikan 3-5 poin per kategori. Fokus pada faktor-faktor yang relevan dengan sistem manajemen mutu.`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            swot: {
                                type: Type.OBJECT,
                                properties: {
                                    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    threats: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            },
                            pestle: {
                                type: Type.OBJECT,
                                properties: {
                                    political: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    economic: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    social: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    technological: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    legal: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    environmental: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            }
                        }
                    }
                }
            });
            
            const data = JSON.parse(response.text);
            
            idCounter.current = 0;
            const transformToFactors = (arr: string[], isExternal = false): AnalysisFactor[] =>
                arr.map(text => ({ id: idCounter.current++, text, impact: 'Sedang', priority: 3, isExternal }));
            
            setSwot({
                strengths: transformToFactors(data.swot.strengths),
                weaknesses: transformToFactors(data.swot.weaknesses),
                opportunities: transformToFactors(data.swot.opportunities, true),
                threats: transformToFactors(data.swot.threats, true)
            });

            setPestle({
                political: transformToFactors(data.pestle.political, true),
                economic: transformToFactors(data.pestle.economic, true),
                social: transformToFactors(data.pestle.social, true),
                technological: transformToFactors(data.pestle.technological, true),
                legal: transformToFactors(data.pestle.legal, true),
                environmental: transformToFactors(data.pestle.environmental || [], true),
            });
            
            setStep(2);
        } catch (err) {
            setError("Gagal menghasilkan analisis. Silakan coba lagi.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const generateAdditionalFactors = async (category: AnalysisCategory) => {
        setIsGenerating(prev => ({ ...prev, [category]: true }));
        setError(null);
        try {
            const sectorForAnalysis = profile.sector === 'lainnya' ? customSector : profile.sector;
            const existingItems = isSwotCategory(category) ? swot[category] : pestle[category as PestleCategory];
            const existingTexts = existingItems.map(item => item.text).join('; ');
            
            const prompt = `Untuk perusahaan di sektor "${sectorForAnalysis}", berikan 2-3 poin ${category} tambahan yang relevan untuk analisis konteks ISO 9001. Hindari duplikasi dengan poin yang sudah ada berikut: "${existingTexts}".`;
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            });
            
            const newTexts: string[] = JSON.parse(response.text);
            const newFactors: AnalysisFactor[] = newTexts.map(text => ({
                id: idCounter.current++,
                text,
                impact: 'Sedang',
                priority: 3,
                isExternal: true
            }));
            
            const updater = (prevState: any) => ({ ...prevState, [category]: [...prevState[category], ...newFactors] });
            if (isSwotCategory(category)) setSwot(updater);
            else setPestle(updater);
            
        } catch (err) {
            setError(`Gagal menghasilkan poin tambahan untuk ${category}.`);
            console.error(err);
        } finally {
            setIsGenerating(prev => ({ ...prev, [category]: false }));
        }
    };
    
    const generateTows = async () => {
        setIsLoading(true);
        setLoadingMessage('Menyusun strategi TOWS berdasarkan analisis SWOT Anda...');
        setError(null);
        try {
            const swotContext = `
                Kekuatan: ${swot.strengths.map(s => s.text).join(', ')}.
                Kelemahan: ${swot.weaknesses.map(w => w.text).join(', ')}.
                Peluang: ${swot.opportunities.map(o => o.text).join(', ')}.
                Ancaman: ${swot.threats.map(t => t.text).join(', ')}.
            `;
            const prompt = `Berdasarkan analisis SWOT ini, buat matriks strategi TOWS. Untuk setiap kategori (SO, ST, WO, WT), berikan 2-3 rekomendasi strategi yang konkret dan relevan dengan ISO 9001. ${swotContext}`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            so_strategies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Strategi Kekuatan-Peluang (Strengths-Opportunities)" },
                            st_strategies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Strategi Kekuatan-Ancaman (Strengths-Threats)" },
                            wo_strategies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Strategi Kelemahan-Peluang (Weaknesses-Opportunities)" },
                            wt_strategies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Strategi Kelemahan-Ancaman (Weaknesses-Threats)" },
                        }
                    }
                }
            });

            const data = JSON.parse(response.text);
            let towsIdCounter = 0;
            const newTows: TowsStrategy[] = [
                ...data.so_strategies.map((text:string) => ({ id: towsIdCounter++, category: 'SO', text, impact: 'Sedang', priority: 3 })),
                ...data.st_strategies.map((text:string) => ({ id: towsIdCounter++, category: 'ST', text, impact: 'Sedang', priority: 3 })),
                ...data.wo_strategies.map((text:string) => ({ id: towsIdCounter++, category: 'WO', text, impact: 'Sedang', priority: 3 })),
                ...data.wt_strategies.map((text:string) => ({ id: towsIdCounter++, category: 'WT', text, impact: 'Sedang', priority: 3 })),
            ];
            setTows(newTows);
            setStep(4);
        } catch (err) {
            setError("Gagal menyusun strategi TOWS. Silakan coba lagi.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const exportToPdf = async () => {
        setIsExporting(true);
        const input = document.getElementById('report-content');
        if (!input) {
            setError("Elemen laporan tidak ditemukan untuk diekspor.");
            setIsExporting(false);
            return;
        }

        try {
            const canvas = await html2canvas(input, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const imgProps = pdf.getImageProperties(imgData);
            const imgWidth = pdfWidth;
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = position - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
            
            const fileName = `Analisis_Konteks_${profile.companyName.replace(/\s+/g, '_') || 'Perusahaan'}.pdf`;
            pdf.save(fileName);
        } catch (e) {
            console.error("PDF Export error:", e);
            setError("Gagal membuat file PDF. Silakan coba lagi.");
        } finally {
            setIsExporting(false);
        }
    };

    const isProfileComplete = useMemo(() => {
        const isSectorValid = profile.sector !== 'lainnya' || (profile.sector === 'lainnya' && customSector.trim() !== '');
        return profile.userName.trim() && profile.jabatan.trim() && profile.companyName.trim() && isSectorValid && profile.unitName.trim();
    }, [profile, customSector]);
    
    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="loader-container">
                    <div className="loader"></div>
                    <p>{loadingMessage}</p>
                </div>
            );
        }
        
        if(error) {
            return (
                 <div className="loader-container">
                    <p style={{color: 'red'}}>{error}</p>
                    <button className="btn-primary" onClick={() => setError(null)}>Coba Lagi</button>
                 </div>
            )
        }
        
        const autoResizeTextarea = (target: HTMLTextAreaElement) => {
            target.style.height = 'auto';
            target.style.height = `${target.scrollHeight}px`;
        };
        
        switch (step) {
            case 1:
                return (
                    <div className="step-card">
                        <h2>Langkah 1: Profil Organisasi</h2>
                        <div className="form-group">
                            <label htmlFor="tanggalAnalisa">Tanggal Analisa</label>
                            <input type="date" id="tanggalAnalisa" name="tanggalAnalisa" value={profile.tanggalAnalisa} onChange={handleProfileChange} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="userName">Nama Anda</label>
                            <input type="text" id="userName" name="userName" value={profile.userName} onChange={handleProfileChange} placeholder="Contoh: Budi Santoso" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="jabatan">Jabatan</label>
                            <input type="text" id="jabatan" name="jabatan" value={profile.jabatan} onChange={handleProfileChange} placeholder="Contoh: Manajer Mutu" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="companyName">Nama Perusahaan</label>
                            <input type="text" id="companyName" name="companyName" value={profile.companyName} onChange={handleProfileChange} placeholder="Contoh: PT. Manufaktur Maju" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sector">Sektor Perusahaan</label>
                            <select id="sector" name="sector" value={profile.sector} onChange={handleProfileChange}>
                                <option value="manufaktur">Manufaktur</option>
                                <option value="jasa">Jasa</option>
                                <option value="teknologi">Teknologi</option>
                                <option value="kesehatan">Kesehatan</option>
                                <option value="pendidikan">Pendidikan</option>
                                <option value="logistik">Logistik</option>
                                <option value="lainnya">Lainnya...</option>
                            </select>
                        </div>
                        {profile.sector === 'lainnya' && (
                            <div className="form-group">
                                <label htmlFor="customSector">Sebutkan Sektor Perusahaan Anda</label>
                                <input
                                    type="text"
                                    id="customSector"
                                    name="customSector"
                                    value={customSector}
                                    onChange={(e) => setCustomSector(e.target.value)}
                                    placeholder="Contoh: Pertambangan, Energi, dll."
                                    aria-label="Sektor Perusahaan Kustom"
                                />
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="unitName">Nama Bagian / Unit</label>
                            <input type="text" id="unitName" name="unitName" value={profile.unitName} onChange={handleProfileChange} placeholder="Contoh: Departemen Quality Control" />
                        </div>
                        <div className="button-group">
                            <button className="btn-ai" onClick={generateInitialAnalysis} disabled={!isProfileComplete}>
                                Lanjut dengan Bantuan AI
                            </button>
                        </div>
                    </div>
                );
            case 2:
                const renderAnalysisCard = (category: AnalysisCategory, title: string) => {
                    const items = isSwotCategory(category) ? swot[category] : pestle[category as PestleCategory];
                    return (
                        <div key={category} className="analysis-card">
                            <div className="analysis-card-header">
                                <h3>{title}</h3>
                                <button onClick={() => generateAdditionalFactors(category)} className="btn-generate-more" disabled={isGenerating[category]}>
                                    {isGenerating[category] ? <div className="spinner-small"></div> : '[+ Generate AI]'}
                                </button>
                            </div>
                            {items.map(item => (
                                <div key={item.id} className="factor-item">
                                    <div className="factor-text-control">
                                        <textarea 
                                           className="editable-input"
                                           value={item.text} 
                                           onChange={e => updateFactor(category, item.id, 'text', e.target.value)}
                                           onInput={e => autoResizeTextarea(e.currentTarget)}
                                           onFocus={e => autoResizeTextarea(e.currentTarget)}
                                           rows={1}
                                        />
                                        <button className="delete-btn" onClick={() => deleteFactor(category, item.id)}>×</button>
                                    </div>
                                    <div className="factor-controls">
                                        <label>Dampak:</label>
                                        <select value={item.impact} onChange={e => updateFactor(category, item.id, 'impact', e.target.value)}>
                                            {IMPACT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                        <label>Prioritas:</label>
                                        <select value={item.priority} onChange={e => updateFactor(category, item.id, 'priority', parseInt(e.target.value))}>
                                             {PRIORITY_SCALES.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ))}
                             <div className="manual-add-section">
                                <input 
                                    type="text"
                                    placeholder={`Tambah ${title} manual...`}
                                    value={manualInputs[category]}
                                    onChange={(e) => setManualInputs(prev => ({ ...prev, [category]: e.target.value }))}
                                    onKeyPress={(e) => e.key === 'Enter' && addFactor(category)}
                                />
                                <button onClick={() => addFactor(category)}>Tambah</button>
                            </div>
                        </div>
                    );
                };

                return (
                    <div className="step-card">
                        <h2>Langkah 2: Validasi Analisis SWOT & PESTLE</h2>
                        <p>Berikut adalah draf analisis. Silakan edit, hapus, tambah, atau generate poin tambahan sesuai kebutuhan. Sesuaikan juga dampak & prioritasnya.</p>
                        
                        <h3 style={{marginTop: '2rem', color: '#003366'}}>Analisis SWOT</h3>
                        <div className="analysis-grid">
                            {renderAnalysisCard('strengths', 'Kekuatan (Strengths)')}
                            {renderAnalysisCard('weaknesses', 'Kelemahan (Weaknesses)')}
                            {renderAnalysisCard('opportunities', 'Peluang (Opportunities)')}
                            {renderAnalysisCard('threats', 'Ancaman (Threats)')}
                        </div>

                         <h3 style={{marginTop: '2rem', color: '#003366'}}>Analisis PESTLE</h3>
                         <div className="analysis-grid">
                            {renderAnalysisCard('political', 'Politik (Political)')}
                            {renderAnalysisCard('economic', 'Ekonomi (Economic)')}
                            {renderAnalysisCard('social', 'Sosial (Social)')}
                            {renderAnalysisCard('technological', 'Teknologi (Technological)')}
                            {renderAnalysisCard('legal', 'Hukum (Legal)')}
                            {renderAnalysisCard('environmental', 'Lingkungan (Environmental)')}
                        </div>
                        
                        <div className="button-group">
                            <button className="btn-secondary" onClick={() => setStep(1)}>Kembali</button>
                            <button className="btn-primary" onClick={() => generateTows()}>Lanjut ke Strategi TOWS</button>
                        </div>
                    </div>
                );
            case 4:
                return (
                     <div className="step-card">
                        <h2>Langkah 3: Validasi Strategi TOWS</h2>
                         <p>Berdasarkan analisis SWOT, berikut adalah draf strategi TOWS. Silakan tinjau dan sesuaikan prioritasnya.</p>
                         <div className="analysis-grid">
                            {(['SO', 'ST', 'WO', 'WT'] as const).map(cat => (
                                <div key={cat} className="analysis-card">
                                    <h3>Strategi {cat}</h3>
                                    {tows.filter(s => s.category === cat).map(item => (
                                         <div key={item.id} className="factor-item">
                                            <p>{item.text}</p>
                                            <div className="factor-controls">
                                                <label>Dampak:</label>
                                                <select value={item.impact} onChange={e => updateTowsStrategy(item.id, 'impact', e.target.value)}>
                                                    {IMPACT_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                                </select>
                                                <label>Prioritas:</label>
                                                <select value={item.priority} onChange={e => updateTowsStrategy(item.id, 'priority', parseInt(e.target.value))}>
                                                     {PRIORITY_SCALES.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                         </div>
                         <div className="button-group">
                            <button className="btn-secondary" onClick={() => setStep(2)}>Kembali</button>
                            <button className="btn-primary" onClick={() => setStep(5)}>Lihat Laporan Final</button>
                        </div>
                    </div>
                );
            case 5:
                const sortedTows = [...tows].sort((a, b) => b.priority - a.priority);
                const finalSector = profile.sector === 'lainnya' ? customSector : profile.sector;
                return (
                    <div className="step-card">
                        <div id="report-content">
                            <h2>Laporan Final: Analisis Konteks Organisasi</h2>
                            
                            <div className="report-section">
                                <h3>1. Identitas Perusahaan</h3>
                                <p><strong>Nama Perusahaan:</strong> {profile.companyName}</p>
                                <p><strong>Sektor:</strong> {finalSector}</p>
                                <p><strong>Unit/Bagian:</strong> {profile.unitName}</p>
                                <p><strong>Tanggal Analisa:</strong> {new Date(profile.tanggalAnalisa).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                <p><strong>Analis:</strong> {profile.userName}</p>
                                <p><strong>Jabatan:</strong> {profile.jabatan}</p>
                            </div>
                            
                            <div className="report-section">
                                <h3>2. Ringkasan Analisis & Relevansi dengan ISO 9001:2015</h3>
                                <div className="report-summary">
                                    <p>Analisis ini mengidentifikasi isu-isu internal dan eksternal yang relevan dengan tujuan dan arah strategis perusahaan, sesuai dengan Klausul 4.1 ISO 9001:2015. Kekuatan (Strengths) dan Kelemahan (Weaknesses) merupakan faktor internal yang dapat dikendalikan, sementara Peluang (Opportunities) dan Ancaman (Threats) adalah faktor eksternal yang perlu diantisipasi. Analisis PESTLE memperdalam pemahaman terhadap lingkungan eksternal. Hasil analisis ini menjadi dasar untuk menentukan risiko dan peluang yang perlu ditangani (Klausul 6.1) guna meningkatkan kepuasan pelanggan dan mencapai peningkatan berkelanjutan.</p>
                                </div>
                            </div>

                            <div className="report-section">
                                <h3>3. Analisis SWOT</h3>
                                <table>
                                    <thead>
                                        <tr><th>Kategori</th><th>Faktor</th><th>Dampak</th><th>Prioritas</th></tr>
                                    </thead>
                                    <tbody>
                                        {swot.strengths.map(f => <tr key={f.id}><td>Kekuatan</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {swot.weaknesses.map(f => <tr key={f.id}><td>Kelemahan</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {swot.opportunities.map(f => <tr key={f.id}><td>Peluang</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {swot.threats.map(f => <tr key={f.id}><td>Ancaman</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                    </tbody>
                                </table>
                            </div>

                            <div className="report-section">
                                <h3>4. Analisis PESTLE</h3>
                                <table>
                                    <thead>
                                        <tr><th>Kategori</th><th>Faktor Eksternal</th><th>Dampak</th><th>Prioritas</th></tr>
                                    </thead>
                                    <tbody>
                                        {pestle.political.map(f => <tr key={f.id}><td>Politik</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {pestle.economic.map(f => <tr key={f.id}><td>Ekonomi</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {pestle.social.map(f => <tr key={f.id}><td>Sosial</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {pestle.technological.map(f => <tr key={f.id}><td>Teknologi</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {pestle.legal.map(f => <tr key={f.id}><td>Hukum/Legal</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                        {pestle.environmental.map(f => <tr key={f.id}><td>Lingkungan</td><td>{f.text}</td><td>{f.impact}</td><td>{f.priority}</td></tr>)}
                                    </tbody>
                                </table>
                            </div>

                            <div className="report-section">
                                <h3>5. Rekomendasi Strategis (TOWS) - Berdasarkan Prioritas</h3>
                                <table>
                                    <thead>
                                        <tr><th>Prioritas</th><th>Kategori</th><th>Rekomendasi Strategi</th><th>Dampak</th></tr>
                                    </thead>
                                    <tbody>
                                        {sortedTows.map(s => <tr key={s.id}><td>{s.priority}</td><td>{s.category}</td><td>{s.text}</td><td>{s.impact}</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div className="button-group">
                            <button className="btn-secondary" onClick={() => setStep(4)}>Kembali & Edit Strategi</button>
                            <button className="btn-primary" onClick={exportToPdf} disabled={isExporting}>
                                {isExporting ? 'Mengekspor...' : 'Ekspor ke PDF'}
                            </button>
                            <button className="btn-secondary" onClick={() => window.location.reload()}>Mulai Analisis Baru</button>
                        </div>
                    </div>
                );
            default:
                return <div>Invalid Step</div>;
        }
    };

    return (
        <div className="container">
            <header>
                <h1>Asisten Analisis Konteks Organisasi</h1>
                <p>Sesuai dengan ISO 9001:2015 Klausul 4.1</p>
            </header>
            <main>
                {renderContent()}
            </main>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);