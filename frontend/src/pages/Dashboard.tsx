import React from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Project Overview</h1>
        <p className="text-slate-500 mt-2">Active Curing Monitoring for Phase 1 Substructure</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-start">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <Clock className="w-8 h-8" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-500">Active Curing Elements</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">42</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-start">
          <div className="p-3 rounded-lg bg-green-50 text-green-600">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-500">Completed Elements</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">108</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm flex items-start ring-1 ring-red-100">
          <div className="p-3 rounded-lg bg-red-50 text-red-600">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-red-600">Requires Action Today</p>
            <p className="text-3xl font-bold text-red-700 mt-1">5</p>
          </div>
        </div>
      </div>

      {/* Needs Attention Panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-900">Today's Curing Needs</h3>
        </div>
        <div className="divide-y divide-slate-200">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <div>
                  <p className="font-medium text-slate-900">Wall Grid {i}A - {i}B (Level 2)</p>
                  <p className="text-sm text-slate-500 mt-1">Day {7 - i} of 7 required</p>
                </div>
              </div>
              <button className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors">
                Ping Contractor
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
