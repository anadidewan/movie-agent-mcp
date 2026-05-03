export interface TmdbMovieResult {
  id: number;
  title: string;
  release_date: string | null;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  genre_ids: number[];
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCastMember {
  name: string;
  character: string;
  order: number;
}

export interface TmdbCrewMember {
  name: string;
  job: string;
  department: string;
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

export interface TmdbMovieDetail {
  id: number;
  title: string;
  release_date: string | null;
  overview: string;
  poster_path: string | null;
  vote_average: number;
  runtime: number | null;
  genres: TmdbGenre[];
}

export interface TmdbMovieDetailWithAppended extends TmdbMovieDetail {
  credits: {
    cast: TmdbCastMember[];
    crew: TmdbCrewMember[];
  };
  keywords: {
    keywords: TmdbKeyword[];
  };
}

export interface TmdbPagedResponse<T> {
  results: T[];
  total_results: number;
  total_pages: number;
  page: number;
}
