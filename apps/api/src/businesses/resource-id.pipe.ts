import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

@Injectable()
export class ResourceIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(value))
      throw new BadRequestException("Invalid resource identifier");
    return value;
  }
}
