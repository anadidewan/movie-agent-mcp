export interface MovieListItem {
  id: number;
  title: string;
  year: number | null;
  overview: string;
  poster_url: string | null;
  rating: number;
}

export interface CastMember {
  name: string;
  character: string;
}

export interface MovieDetail extends MovieListItem {
  runtime: number | null;
  genres: string[];
  cast: CastMember[]; // top 5 only
  director: string | null;
  keywords: string[];
}
