import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export class NotificationQueryDto extends PaginationQueryDto {
  // Query strings carry "true"/"false" as text; @Type(() => Boolean) would
  // turn the string "false" into `true`.
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}
