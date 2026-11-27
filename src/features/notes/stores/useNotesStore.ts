import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  buildFolderPathMap,
  createFolder as repoCreateFolder,
  createNote as repoCreateNote,
  deleteFolder as repoDeleteFolder,
  deleteNote as repoDeleteNote,
  disambiguateWikiLink as repoDisambiguateWikiLink,
  getBacklinks,
  getOrCreateDailyNote as repoGetOrCreateDailyNote,
  importMarkdownFiles,
  listFolders,
  listNotes,
  listTagsAndMappings,
  moveNote as repoMoveNote,
  renameFolder as repoRenameFolder,
  renameNote as repoRenameNote,
  toggleFavoriteNote as repoToggleFavoriteNote,
  updateNoteContent as repoUpdateNoteContent,
  updateNoteLanguage as repoUpdateNoteLanguage,
  type CodeLanguage,
  type CreateNoteInput,
  type DeleteFolderMode,
  type FolderRecord,
  type ImportResult,
  type NoteRecord,
  type TagWithCount,
} from '@/services';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
export type EditorMode = 'edit' | 'preview';

export interface WikiLinkResolution {
  readonly exactMatch: NoteRecord | null;
  readonly ambiguousMatches: readonly NoteRecord[];
}

interface NotesStoreState {
  notes: NoteRecord[];
  folders: FolderRecord[];
  tags: TagWithCount[];
  noteTagsMap: Map<string, string[]>;
  activeNoteId: string | null;
  backlinks: NoteRecord[];
  saveStatus: SaveStatus;
  saveError: string | null;
  editorMode: EditorMode;
  isFullscreen: boolean;
  explorerCollapsed: boolean;
  mobileExplorerOpen: boolean;
  metadataPanelCollapsed: boolean;
  expandedFolderIds: string[];
  searchQuery: string;
  selectedTag: string | null;
  selectedFolderFilterId: string | null;
  initialized: boolean;
  loading: boolean;

  initialize: (force?: boolean) => Promise<void>;
  refreshVault: () => Promise<void>;
  setActiveNoteId: (noteId: string | null) => Promise<void>;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  setEditorMode: (mode: EditorMode) => void;
  toggleEditorMode: () => void;
  setFullscreen: (fullscreen: boolean) => void;
  toggleFullscreen: () => void;
  toggleExplorer: () => void;
  setExplorerCollapsed: (collapsed: boolean) => void;
  toggleMobileExplorer: () => void;
  setMobileExplorerOpen: (open: boolean) => void;
  toggleMetadataPanel: () => void;
  setMetadataPanelCollapsed: (collapsed: boolean) => void;
  toggleFolderExpanded: (folderId: string) => void;
  expandFolder: (folderId: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedFolderFilterId: (folderId: string | null) => void;

  createNote: (input?: CreateNoteInput) => Promise<NoteRecord>;
  saveNoteContent: (noteId: string, content: string) => Promise<NoteRecord>;
  renameNote: (noteId: string, newTitle: string) => Promise<NoteRecord>;
  updateNoteLanguage: (noteId: string, language: CodeLanguage) => Promise<NoteRecord>;
  moveNote: (noteId: string, folderId: string | null) => Promise<NoteRecord>;
  toggleFavorite: (noteId: string) => Promise<NoteRecord>;
  deleteNote: (noteId: string) => Promise<void>;

  createFolder: (name: string, parentId?: string | null) => Promise<FolderRecord>;
  renameFolder: (folderId: string, newName: string) => Promise<FolderRecord>;
  deleteFolder: (folderId: string, mode: DeleteFolderMode) => Promise<void>;

  openDailyNote: (dateStr?: string) => Promise<NoteRecord>;
  disambiguateLink: (
    sourceNoteId: string,
    oldTargetText: string,
    targetNoteId: string,
  ) => Promise<NoteRecord>;
  importFiles: (files: FileList | readonly File[]) => Promise<ImportResult>;
  resolveWikiLinkTargets: (targetText: string) => WikiLinkResolution;
}

const NOTES_UI_STORAGE_KEY = 'nexus-notes-ui-store';
let inflightInit: Promise<void> | null = null;

export const useNotesStore = create<NotesStoreState>()(
  persist(
    (set, get) => ({
      notes: [],
      folders: [],
      tags: [],
      noteTagsMap: new Map(),
      activeNoteId: null,
      backlinks: [],
      saveStatus: 'saved',
      saveError: null,
      editorMode: 'edit',
      isFullscreen: false,
      explorerCollapsed: false,
      mobileExplorerOpen: false,
      metadataPanelCollapsed: false,
      expandedFolderIds: [],
      searchQuery: '',
      selectedTag: null,
      selectedFolderFilterId: null,
      initialized: false,
      loading: false,

      initialize: async (force = false) => {
        if (get().initialized && !force) return;
        if (inflightInit && !force) return inflightInit;

        set({ loading: !get().initialized });
        inflightInit = (async () => {
          try {
            await get().refreshVault();
            set({ initialized: true, loading: false });
          } catch (error) {
            set({
              loading: false,
              saveError:
                error instanceof Error
                  ? error.message
                  : 'Failed to load notes database.',
            });
          } finally {
            inflightInit = null;
          }
        })();

        return inflightInit;
      },

      refreshVault: async () => {
        const [notes, folders, tagData] = await Promise.all([
          listNotes(),
          listFolders(),
          listTagsAndMappings(),
        ]);

        const currentActiveId = get().activeNoteId;
        const activeExists =
          currentActiveId && notes.some((n) => n.id === currentActiveId);
        const resolvedActiveId = activeExists ? currentActiveId : null;
        const backlinks = resolvedActiveId
          ? await getBacklinks(resolvedActiveId)
          : [];

        set({
          notes,
          folders,
          tags: tagData.tags,
          noteTagsMap: tagData.noteTagsMap,
          activeNoteId: resolvedActiveId,
          backlinks,
        });
      },

      setActiveNoteId: async (noteId) => {
        const backlinks = noteId ? await getBacklinks(noteId) : [];
        set({
          activeNoteId: noteId,
          backlinks,
          saveStatus: 'saved',
          saveError: null,
          mobileExplorerOpen: false,
        });
      },

      setSaveStatus: (status, error = null) =>
        set({ saveStatus: status, saveError: error }),

      setEditorMode: (mode) => set({ editorMode: mode }),

      toggleEditorMode: () =>
        set((state) => ({
          editorMode: state.editorMode === 'edit' ? 'preview' : 'edit',
        })),

      setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

      toggleFullscreen: () =>
        set((state) => ({ isFullscreen: !state.isFullscreen })),

      toggleExplorer: () =>
        set((state) => ({ explorerCollapsed: !state.explorerCollapsed })),

      setExplorerCollapsed: (collapsed) => set({ explorerCollapsed: collapsed }),

      toggleMobileExplorer: () =>
        set((state) => ({ mobileExplorerOpen: !state.mobileExplorerOpen })),

      setMobileExplorerOpen: (open) => set({ mobileExplorerOpen: open }),

      toggleMetadataPanel: () =>
        set((state) => ({
          metadataPanelCollapsed: !state.metadataPanelCollapsed,
        })),

      setMetadataPanelCollapsed: (collapsed) =>
        set({ metadataPanelCollapsed: collapsed }),

      toggleFolderExpanded: (folderId) =>
        set((state) => ({
          expandedFolderIds: state.expandedFolderIds.includes(folderId)
            ? state.expandedFolderIds.filter((id) => id !== folderId)
            : [...state.expandedFolderIds, folderId],
        })),

      expandFolder: (folderId) =>
        set((state) =>
          state.expandedFolderIds.includes(folderId)
            ? state
            : { expandedFolderIds: [...state.expandedFolderIds, folderId] },
        ),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setSelectedTag: (tag) => set({ selectedTag: tag }),

      setSelectedFolderFilterId: (folderId) =>
        set({ selectedFolderFilterId: folderId }),

      createNote: async (input) => {
        const created = await repoCreateNote(input);
        if (created.folderId) {
          get().expandFolder(created.folderId);
        }
        await get().refreshVault();
        const backlinks = await getBacklinks(created.id);
        set({
          activeNoteId: created.id,
          backlinks,
          saveStatus: 'saved',
          saveError: null,
          mobileExplorerOpen: false,
        });
        return created;
      },

      saveNoteContent: async (noteId, content) => {
        set({ saveStatus: 'saving', saveError: null });
        try {
          const updated = await repoUpdateNoteContent(noteId, content);
          await get().refreshVault();
          set({ saveStatus: 'saved', saveError: null });
          return updated;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to save note to IndexedDB.';
          set({ saveStatus: 'error', saveError: message });
          throw error;
        }
      },

      renameNote: async (noteId, newTitle) => {
        const updated = await repoRenameNote(noteId, newTitle);
        await get().refreshVault();
        return updated;
      },

      updateNoteLanguage: async (noteId, language) => {
        const updated = await repoUpdateNoteLanguage(noteId, language);
        await get().refreshVault();
        return updated;
      },

      moveNote: async (noteId, folderId) => {
        const updated = await repoMoveNote(noteId, folderId);
        if (folderId) {
          get().expandFolder(folderId);
        }
        await get().refreshVault();
        return updated;
      },

      toggleFavorite: async (noteId) => {
        const updated = await repoToggleFavoriteNote(noteId);
        await get().refreshVault();
        return updated;
      },

      deleteNote: async (noteId) => {
        await repoDeleteNote(noteId);
        if (get().activeNoteId === noteId) {
          set({ activeNoteId: null, backlinks: [] });
        }
        await get().refreshVault();
      },

      createFolder: async (name, parentId = null) => {
        const created = await repoCreateFolder(name, parentId);
        if (parentId) {
          get().expandFolder(parentId);
        }
        get().expandFolder(created.id);
        await get().refreshVault();
        return created;
      },

      renameFolder: async (folderId, newName) => {
        const updated = await repoRenameFolder(folderId, newName);
        await get().refreshVault();
        return updated;
      },

      deleteFolder: async (folderId, mode) => {
        await repoDeleteFolder(folderId, mode);
        await get().refreshVault();
      },

      openDailyNote: async (dateStr) => {
        const note = await repoGetOrCreateDailyNote(dateStr);
        if (note.folderId) {
          get().expandFolder(note.folderId);
        }
        await get().refreshVault();
        const backlinks = await getBacklinks(note.id);
        set({
          activeNoteId: note.id,
          backlinks,
          saveStatus: 'saved',
          saveError: null,
          mobileExplorerOpen: false,
        });
        return note;
      },

      disambiguateLink: async (sourceNoteId, oldTargetText, targetNoteId) => {
        const updated = await repoDisambiguateWikiLink(
          sourceNoteId,
          oldTargetText,
          targetNoteId,
        );
        await get().refreshVault();
        return updated;
      },

      importFiles: async (files) => {
        const result = await importMarkdownFiles(files);
        await get().refreshVault();
        const firstImported = result.importedNotes[0];
        if (firstImported) {
          if (firstImported.folderId) {
            get().expandFolder(firstImported.folderId);
          }
          await get().setActiveNoteId(firstImported.id);
        }
        return result;
      },

      resolveWikiLinkTargets: (targetText) => {
        const { notes, folders } = get();
        const normalized = targetText.trim().toLowerCase();
        if (!normalized) {
          return { exactMatch: null, ambiguousMatches: [] };
        }

        const folderPathMap = buildFolderPathMap(folders);

        if (normalized.includes('/')) {
          const qualifiedMatches = notes.filter((note) => {
            const folderPath = note.folderId
              ? folderPathMap.get(note.folderId) ?? ''
              : '';
            const qualified = folderPath
              ? `${folderPath}/${note.title}`.toLowerCase()
              : note.title.toLowerCase();
            return qualified === normalized;
          });

          if (qualifiedMatches.length === 1 && qualifiedMatches[0]) {
            return { exactMatch: qualifiedMatches[0], ambiguousMatches: [] };
          }
          if (qualifiedMatches.length > 1) {
            return { exactMatch: null, ambiguousMatches: qualifiedMatches };
          }
        }

        const titleMatches = notes.filter(
          (note) => note.title.trim().toLowerCase() === normalized,
        );
        if (titleMatches.length === 1 && titleMatches[0]) {
          return { exactMatch: titleMatches[0], ambiguousMatches: [] };
        }
        if (titleMatches.length > 1) {
          return { exactMatch: null, ambiguousMatches: titleMatches };
        }

        return { exactMatch: null, ambiguousMatches: [] };
      },
    }),
    {
      name: NOTES_UI_STORAGE_KEY,
      partialize: (state) => ({
        explorerCollapsed: state.explorerCollapsed,
        metadataPanelCollapsed: state.metadataPanelCollapsed,
        expandedFolderIds: state.expandedFolderIds,
      }),
    },
  ),
);
