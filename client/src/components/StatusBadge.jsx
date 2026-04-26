import { useI18n } from '../context/I18nContext.jsx';

const styles = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  soil_collected: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  on_hold: 'bg-amber-100 text-amber-900 border-amber-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  visited: 'bg-purple-100 text-purple-800 border-purple-200',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failure: 'bg-rose-100 text-rose-900 border-rose-200',
};

export default function StatusBadge({ status }) {
  const { t } = useI18n();
  const cls = styles[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  const key = `status.${status}`;
  const translated = t(key);
  const label = translated !== key ? translated : status?.replace(/_/g, ' ') ?? '';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
