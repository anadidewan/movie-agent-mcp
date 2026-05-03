import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { AppError, ErrorCode } from '../types/errors';

import { SearchMoviesSchema } from '../schemas/searchMovies';
import { GetMovieDetailsSchema } from '../schemas/getMovieDetails';
import { DiscoverMoviesSchema } from '../schemas/discoverMovies';
import { GetRecommendationsSchema } from '../schemas/getRecommendations';
import { GetTrendingSchema } from '../schemas/getTrending';
import { GetMovieIdSchema } from '../schemas/getMovieId';
import { GetGenreIdSchema } from '../schemas/getGenreId';

import { searchMovies } from '../services/searchMovies';
import { getMovieDetails } from '../services/getMovieDetails';
import { discoverMovies } from '../services/discoverMovies';
import { getRecommendations } from '../services/getRecommendations';
import { getTrending } from '../services/getTrending';
import { getMovieId } from '../services/getMovieId';
import { getGenreId } from '../services/getGenreId';

/**
 * Tool handler router — POST /tools/:tool dispatcher.
 *
 * For each incoming POST request:
 *  1. Resolves the tool name from :tool param.
 *  2. Validates the request body against the tool's Zod schema.
 *  3. Calls the corresponding service function.
 *  4. Returns the service result as JSON with HTTP 200.
 *
 * Unknown tool names → 404 NOT_FOUND
 * Validation failures → ZodError forwarded to error handler → 400 VALIDATION_ERROR
 * Service errors → forwarded to error handler
 *
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 15.1, 15.2, 15.3
 */
const router: IRouter = Router();

router.post('/:tool', async (req: Request, res: Response, next: NextFunction) => {
  const { tool } = req.params;

  try {
    switch (tool) {
      case 'search_movies': {
        const parsed = SearchMoviesSchema.parse(req.body);
        const result = await searchMovies(parsed);
        return res.status(200).json(result);
      }

      case 'get_movie_details': {
        const parsed = GetMovieDetailsSchema.parse(req.body);
        const result = await getMovieDetails(parsed);
        return res.status(200).json(result);
      }

      case 'discover_movies': {
        const parsed = DiscoverMoviesSchema.parse(req.body);
        const result = await discoverMovies(parsed);
        return res.status(200).json(result);
      }

      case 'get_recommendations': {
        const parsed = GetRecommendationsSchema.parse(req.body);
        const result = await getRecommendations(parsed);
        return res.status(200).json(result);
      }

      case 'get_trending': {
        const parsed = GetTrendingSchema.parse(req.body);
        const result = await getTrending(parsed);
        return res.status(200).json(result);
      }

      case 'get_movie_id': {
        const parsed = GetMovieIdSchema.parse(req.body);
        const result = await getMovieId(parsed);
        return res.status(200).json(result);
      }

      case 'get_genre_id': {
        const parsed = GetGenreIdSchema.parse(req.body);
        const result = await getGenreId(parsed.name);
        return res.status(200).json(result);
      }

      default:
        return next(new AppError(ErrorCode.NOT_FOUND, 404, 'Unknown tool'));
    }
  } catch (err) {
    return next(err);
  }
});

export default router;
