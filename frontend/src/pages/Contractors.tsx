import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Ban, CheckCircle2, KeyRound, Loader2, Phone, Plus, SquarePen, Users, X } from 'lucide-react';
import { authService, hierarchyService, userService } from '../services/api';

type ContractorRecord = {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  mobile_number: string;
  is_active: boolean | number;
  structuresCount?: number;
  curableElementsCount?: string;
};

type ContractorFormState = {
  full_name: string;
  email: string;
  mobile_number: string;
  password: string;
};

const EMPTY_FORM: ContractorFormState = {
  full_name: '',
  email: '',
  mobile_number: '',
  password: '',
};

export default function Contractors() {
  const currentUser = authService.getCurrentUser();
  if (currentUser?.role === 'contractor') {
    return <Navigate to="/" replace />;
  }
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [contractors, setContractors] = useState<ContractorRecord[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorRecord | null>(null);
  const [createForm, setCreateForm] = useState<ContractorFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ContractorFormState>(EMPTY_FORM);
  const [resetPassword, setResetPassword] = useState('');

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 11);

  const fetchContractors = async () => {
    try {
      setLoading(true);
      const monitorUserId = Number(currentUser?.user_id) || 0;
      if (!monitorUserId) {
        setContractors([]);
        return;
      }
      const [users, projects, metricsResponse] = await Promise.all([
        userService.getUsers(undefined, 'contractor'),
        hierarchyService.getProjects(monitorUserId),
        userService.getContractorMetrics(),
      ]);
      const metricsByContractor = new Map<number, { structures_count: number; scheduled_elements_count: number; posted_today_count: number }>(
        (metricsResponse?.metrics || []).map((metric: any) => [metric.contractor_id, metric]),
      );

      const packageLists = await Promise.all(projects.map((project: any) => hierarchyService.getPackages(project.id)));
      const packages = packageLists.flat();
      const structureLists = await Promise.all(packages.map((pkg: any) => hierarchyService.getStructures(pkg.id)));
      const structures = structureLists.flat();

      const contractorsWithCounts = users.map((contractor: ContractorRecord) => ({
        ...contractor,
        structuresCount: metricsByContractor.get(contractor.id)?.structures_count ?? structures.filter((structure: any) => structure.contractor_id === contractor.id).length,
        curableElementsCount: (() => {
          const metrics = metricsByContractor.get(contractor.id);
          if (!metrics) return '0/0';
          return `${metrics.posted_today_count}/${metrics.scheduled_elements_count}`;
        })(),
      }));

      setContractors(contractorsWithCounts);
    } catch (error) {
      console.error('Failed to fetch contractors', error);
      alert('Failed to load contractors.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchContractors();
  }, []);

  const openCreateModal = () => {
    setCreateForm(EMPTY_FORM);
    setShowCreateModal(true);
  };

  const openEditModal = (contractor: ContractorRecord) => {
    setSelectedContractor(contractor);
    setEditForm({
      full_name: contractor.full_name || '',
      email: contractor.email || contractor.username || '',
      mobile_number: contractor.mobile_number || '',
      password: '',
    });
    setShowEditModal(true);
  };

  const openResetModal = (contractor: ContractorRecord) => {
    setSelectedContractor(contractor);
    setResetPassword('');
    setShowResetModal(true);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createForm.mobile_number.length !== 11) {
      alert('Mobile number must be exactly 11 digits.');
      return;
    }

    try {
      setSubmitting(true);
      const normalizedEmail = createForm.email.trim().toLowerCase();
      const emailCheck = await userService.checkEmail(normalizedEmail);
      if (emailCheck.exists) {
        alert('This email ID is already present in the system. Use another email.');
        return;
      }
      await userService.create_user({
        username: normalizedEmail,
        email: normalizedEmail,
        full_name: createForm.full_name.trim(),
        mobile_number: createForm.mobile_number,
        password: createForm.password,
        role: 'contractor',
      });
      setShowCreateModal(false);
      setCreateForm(EMPTY_FORM);
      await fetchContractors();
      alert('Contractor enrolled successfully.');
    } catch (error: any) {
      alert(`Failed to enroll contractor: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContractor) return;
    if (editForm.mobile_number.length !== 11) {
      alert('Mobile number must be exactly 11 digits.');
      return;
    }

    try {
      setSavingEdit(true);
      const normalizedEmail = editForm.email.trim().toLowerCase();
      const emailCheck = await userService.checkEmail(normalizedEmail, selectedContractor.id);
      if (emailCheck.exists) {
        alert('This email ID is already present in the system. Use another email.');
        return;
      }
      await userService.update_user(selectedContractor.id, {
        full_name: editForm.full_name.trim(),
        email: normalizedEmail,
        mobile_number: editForm.mobile_number,
      });
      setShowEditModal(false);
      setSelectedContractor(null);
      await fetchContractors();
      alert('Contractor updated successfully.');
    } catch (error: any) {
      alert(`Failed to update contractor: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContractor) return;
    try {
      setResettingPassword(true);
      await userService.resetUserPassword(selectedContractor.id, resetPassword);
      setShowResetModal(false);
      setSelectedContractor(null);
      setResetPassword('');
      alert('Password reset successfully.');
    } catch (error: any) {
      alert(`Failed to reset password: ${error.response?.data?.detail || error.message}`);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleToggleActive = async (contractor: ContractorRecord) => {
    try {
      await userService.toggleUserActive(contractor.id);
      await fetchContractors();
    } catch (error: any) {
      alert(`Failed to update contractor status: ${error.response?.data?.detail || error.message}`);
    }
  };

  const renderModalShell = (
    title: string,
    subtitle: string,
    onClose: () => void,
    content: React.ReactNode,
  ) => (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-8 py-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-8 py-7">{content}</div>
      </div>
    </div>
  );

  if (loading && contractors.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-4rem)] min-h-0 w-full flex-col overflow-hidden px-5 py-4 md:px-8 md:py-8 xl:px-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:mb-8 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            <Users className="h-8 w-8 text-blue-600" /> Contractor Management
          </h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-slate-500 md:text-base">
            Monitor Control: Enroll and manage your contractor accounts.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white shadow-md transition-all hover:bg-slate-800 active:scale-95"
        >
          <Plus className="h-5 w-5" /> Enroll Contractor
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
          <div className="w-full overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky top-0 z-10 w-[36%] bg-slate-50 p-5 pl-8 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Contractor</th>
                <th className="sticky top-0 z-10 w-[16%] bg-slate-50 p-5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">WhatsApp</th>
                <th className="sticky top-0 z-10 w-[10%] bg-slate-50 p-5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Status</th>
                <th className="sticky top-0 z-10 w-[8%] bg-slate-50 p-5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Structures</th>
                <th className="sticky top-0 z-10 w-[12%] bg-slate-50 p-5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Curable Elements</th>
                <th className="sticky top-0 z-10 w-[18%] bg-slate-50 p-5 pr-8 text-right text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contractors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-sm font-medium italic text-slate-400">
                    No contractors enrolled yet.
                  </td>
                </tr>
              ) : contractors.map((contractor) => {
                const isActive = Boolean(contractor.is_active);
                return (
                  <tr key={contractor.id} className="group transition-colors hover:bg-slate-50/60">
                    <td className="p-6 pl-8 align-top">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 shadow-sm">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-extrabold text-slate-900 transition-colors group-hover:text-blue-700">
                            {contractor.full_name || 'Unnamed contractor'}
                          </div>
                          <div className="mt-1 break-all text-xs font-bold text-slate-500">
                            {contractor.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 align-top">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span>{contractor.mobile_number}</span>
                      </div>
                    </td>
                    <td className="p-6 align-top">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-6 align-top text-sm font-extrabold text-slate-700">
                      {contractor.structuresCount ?? 0}
                    </td>
                    <td className="p-6 align-top text-sm font-extrabold text-slate-700">
                      {contractor.curableElementsCount ?? '0/0'}
                    </td>
                    <td className="p-6 pr-8 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(contractor)}
                          title="Edit contractor"
                          className="rounded-xl border-2 border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                        >
                          <SquarePen className="h-4 w-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => openResetModal(contractor)}
                          title="Reset password"
                          className="rounded-xl border-2 border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                        >
                          <KeyRound className="h-4 w-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => void handleToggleActive(contractor)}
                          title={isActive ? 'Deactivate contractor' : 'Activate contractor'}
                          className={`rounded-xl border-2 bg-white p-2.5 shadow-sm transition-colors active:scale-95 ${isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                        >
                          {isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
      </div>

      {showCreateModal && renderModalShell(
        'Enroll Contractor',
        'Create a contractor account linked to your monitor profile.',
        () => setShowCreateModal(false),
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Name of Contractor</label>
            <input
              required
              type="text"
              value={createForm.full_name}
              onChange={(e) => setCreateForm((current) => ({ ...current, full_name: e.target.value }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div>
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Email ID</label>
            <input
              required
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((current) => ({ ...current, email: e.target.value }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div>
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Mobile Number (WhatsApp)</label>
            <input
              required
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={createForm.mobile_number}
              onChange={(e) => setCreateForm((current) => ({ ...current, mobile_number: digitsOnly(e.target.value) }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Initial Password</label>
            <input
              required
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((current) => ({ ...current, password: e.target.value }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-600 transition-colors hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Contractor'}
            </button>
          </div>
        </form>,
      )}

      {showEditModal && renderModalShell(
        'Edit Contractor',
        'Update contractor profile details.',
        () => {
          setShowEditModal(false);
          setSelectedContractor(null);
        },
        <form onSubmit={handleSaveEdit} className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Name of Contractor</label>
            <input
              required
              type="text"
              value={editForm.full_name}
              onChange={(e) => setEditForm((current) => ({ ...current, full_name: e.target.value }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div>
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Email ID</label>
            <input
              required
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((current) => ({ ...current, email: e.target.value }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div>
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Mobile Number (WhatsApp)</label>
            <input
              required
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={editForm.mobile_number}
              onChange={(e) => setEditForm((current) => ({ ...current, mobile_number: digitsOnly(e.target.value) }))}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowEditModal(false); setSelectedContractor(null); }} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-600 transition-colors hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={savingEdit} className="flex min-w-[160px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {savingEdit ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </form>,
      )}

      {showResetModal && renderModalShell(
        'Reset Password',
        `Set a new password for ${selectedContractor?.full_name || selectedContractor?.email || 'this contractor'}.`,
        () => {
          setShowResetModal(false);
          setSelectedContractor(null);
        },
        <form onSubmit={handleResetPassword} className="space-y-5">
          <div>
            <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">New Password</label>
            <input
              required
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowResetModal(false); setSelectedContractor(null); }} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-600 transition-colors hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={resettingPassword} className="flex min-w-[170px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {resettingPassword ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Reset Password'}
            </button>
          </div>
        </form>,
      )}
    </div>
  );
}
