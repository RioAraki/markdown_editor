'use client';

import React from 'react';
import { X, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { AuditResult } from '@/lib/auditRules';

interface AuditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: AuditResult | null;
  onConfirm: () => void;
}

export function AuditDialog({ isOpen, onClose, result, onConfirm }: AuditDialogProps) {
  if (!isOpen || !result) return null;

  const hasChanges = result.changes.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              {hasChanges ? (
                <>
                  <AlertCircle className="w-5 h-5 mr-2 text-blue-600" />
                  Audit Results - {result.changes.length} {result.changes.length === 1 ? 'Issue' : 'Issues'} Found
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                  Audit Results - No Issues Found
                </>
              )}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {hasChanges
                ? 'Review the proposed changes below'
                : 'Your text follows all formatting rules'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {hasChanges ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
                <div className="text-sm text-blue-800">
                  <p>
                    Found {result.changes.length} formatting {result.changes.length === 1 ? 'issue' : 'issues'} across{' '}
                    {new Set(result.changes.map(c => c.line)).size} {new Set(result.changes.map(c => c.line)).size === 1 ? 'line' : 'lines'}
                  </p>
                </div>
              </div>

              {/* Changes List */}
              <div className="space-y-3">
                {result.changes.map((change, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                          Line {change.line}
                        </span>
                        <span className="text-xs text-gray-600">{change.rule}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{change.description}</p>

                    {/* Before/After */}
                    <div className="space-y-2">
                      {/* Before */}
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-16 text-xs text-red-600 font-medium pt-2">
                          Before:
                        </div>
                        <div className="flex-1 bg-red-50 border border-red-200 rounded p-2">
                          <code className="text-sm text-red-900 break-all">{change.original}</code>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>

                      {/* After */}
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-16 text-xs text-green-600 font-medium pt-2">
                          After:
                        </div>
                        <div className="flex-1 bg-green-50 border border-green-200 rounded p-2">
                          <code className="text-sm text-green-900 break-all">{change.fixed}</code>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">All Good!</h3>
              <p className="text-gray-600">Your text follows all formatting rules.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {hasChanges && (
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm"
            >
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
