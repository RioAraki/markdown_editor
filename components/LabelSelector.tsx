'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Tag, X, Settings } from 'lucide-react';
import { Label } from '@/types/label';
import { useLabels } from '@/contexts/LabelContext';
import { LabelManager } from './LabelManager';

interface LabelSelectorProps {
  selectedLabels: string[];
  onLabelsChange: (labelIds: string[]) => void;
}

export function LabelSelector({ selectedLabels, onLabelsChange }: LabelSelectorProps) {
  const { labels } = useLabels();
  const [isOpen, setIsOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const toggleLabel = (labelId: string) => {
    if (selectedLabels.includes(labelId)) {
      onLabelsChange(selectedLabels.filter(id => id !== labelId));
    } else {
      onLabelsChange([...selectedLabels, labelId]);
    }
  };

  const getSelectedLabelObjects = () => {
    return labels.filter(label => selectedLabels.includes(label.id));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected labels display */}
      <div className="flex items-center gap-2">
        {getSelectedLabelObjects().map(label => (
          <span
            key={label.id}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-white"
            style={{ backgroundColor: label.color }}
          >
            {label.name}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleLabel(label.id);
              }}
              className="hover:bg-black/20 rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {/* Add label button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          title="Add labels"
        >
          <Tag className="w-3 h-3" />
          {selectedLabels.length === 0 && 'Add Label'}
        </button>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="p-2">
            <p className="text-xs font-semibold text-gray-500 mb-2 px-2">Select Labels</p>
            <div className="space-y-1">
              {labels.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2 px-2 text-center">
                  No labels yet
                </p>
              ) : (
                labels.map(label => {
                  const isSelected = selectedLabels.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      onClick={() => toggleLabel(label.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1 text-left">{label.name}</span>
                      {isSelected && (
                        <div className="w-4 h-4 flex items-center justify-center">
                          <div className="w-2 h-2 bg-blue-600 rounded-full" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Manage labels button */}
            <div className="mt-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsManagerOpen(true);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <Settings className="w-4 h-4" />
                Manage Labels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Label Manager Modal */}
      <LabelManager isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} />
    </div>
  );
}
