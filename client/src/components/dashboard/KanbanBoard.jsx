// client/src/components/dashboard/KanbanBoard.jsx
import React from 'react';

export default function KanbanBoard({ kanban }) {
  const columns = [
    { key: 'design_proposal', label: 'Design Proposal', color: 'text-purple-600', border: 'border-purple-200', bg: 'bg-purple-50' },
    { key: 'sanction', label: 'Sanction', color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50' },
    { key: 'execution', label: 'Execution', color: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50' },
    { key: 'completed', label: 'Completed', color: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' },
    { key: 'pending', label: 'Pending', color: 'text-gray-600', border: 'border-gray-200', bg: 'bg-gray-50' },
  ];

  const totalActive = (kanban?.design_proposal?.length || 0) + 
                      (kanban?.sanction?.length || 0) + 
                      (kanban?.execution?.length || 0);

  return (
    <div className="card w-full">
      <div className="flex items-center gap-2 mb-6">
        <h3 className="text-lg font-black text-[#1A1A1A]">Projects</h3>
        <span className="px-2 py-0.5 rounded-full bg-[#F5F5F5] border border-[#EBEBEB] text-[#6B6B6B] text-xs font-bold">
          {totalActive} Total
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 overflow-x-auto lg:overflow-x-visible pb-2 scrollbar-thin">
        {columns.map((col, idx) => {
          const projects = kanban?.[col.key] || [];
          return (
            <div key={col.key} className="relative flex-1 flex flex-col">
              <div className={`flex flex-col min-w-[240px] lg:min-w-0 h-full rounded-xl border ${col.border} ${col.bg} overflow-hidden min-h-[450px]`}>
                <div className={`p-3 border-b ${col.border} bg-white/60 backdrop-blur-sm sticky top-0 z-10`}>
                  <div className={`text-[10px] font-black ${col.color} uppercase tracking-widest flex items-center justify-between`}>
                    {col.label}
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-white border border-[#E0E0E0] text-[#6B6B6B] shadow-sm font-bold">
                      {projects.length}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                  {projects.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 opacity-40">
                      <p className="text-[10px] font-bold uppercase tracking-tighter">No projects</p>
                    </div>
                  )}
                  {projects.map((p) => (
                    <a key={p.id} href={`/projects/${p.id}`}
                      className="block bg-white border border-[#E0E0E0] rounded-lg p-3 hover:border-[rgba(224,90,30,0.4)] hover:shadow-md transition-all group relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-opacity bg-[#E05A1E]" />
                      <p className="text-sm font-bold text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors truncate mb-0.5">{p.name}</p>
                      <p className="text-[10px] text-muted font-medium truncate uppercase tracking-tight">{p.client_name}</p>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F5F5F5]">
                        <span className="text-[9px] font-black text-muted uppercase tracking-tighter bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{p.type}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
              {idx === 2 && (
                <div className="hidden lg:block absolute -right-2 top-4 bottom-4 w-[1px] bg-gray-200" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
