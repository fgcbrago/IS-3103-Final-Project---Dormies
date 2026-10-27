import React from 'react'

const COLORS = {
  Active: 'green', Paid: 'green', Completed: 'green', Approved: 'green', Available: 'green', Refunded: 'green', Published: 'green', Sent: 'green', 'Checked out': 'gray',
  Unpaid: 'amber', Pending: 'amber', 'In Progress': 'blue', Held: 'blue', Draft: 'gray', Occupied: 'blue', Inside: 'amber', Unassigned: 'gray', Normal: 'gray', Medium: 'amber',
  Overdue: 'red', Rejected: 'red', Forfeited: 'red', Maintenance: 'amber', Cancelled: 'gray', Inactive: 'gray', Archived: 'gray', Failed: 'red',
  Low: 'gray', High: 'red', Emergency: 'red', Urgent: 'red', Skipped: 'gray', 'Not sent': 'gray',
}

export default function StatusBadge({ value, label }) {
  return <span className={`badge b-${COLORS[value] || 'gray'}`}>{label || value}</span>
}
